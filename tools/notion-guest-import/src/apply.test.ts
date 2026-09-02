import { describe, expect, it } from 'vitest';
import type { GuestImportPlan, PlannedGuest } from './core.ts';
import {
  assertPlanApplied,
  auditSocialSources,
  computeApplyDelta,
  type ExistingGuestData,
} from './apply.ts';
import { transactionalSql } from './cli.ts';

function plannedGuest(overrides: Partial<PlannedGuest> = {}): PlannedGuest {
  return {
    id: 'gst-notion-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    slug: 'guest-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    notionUrl: 'https://app.notion.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    name: 'محمد الخضر',
    role: 'خبير مبيعات',
    city: 'الرياض',
    bio: 'نبذة عامة',
    photoSourceRef: null,
    publicSocialSources: ['https://x.com/mohammed'],
    ...overrides,
  };
}

function plan(guest = plannedGuest()): GuestImportPlan {
  return {
    schemaVersion: 1,
    mode: 'dry-run',
    source: 'notion-guest-library',
    guests: [guest],
    appearances: [
      {
        guestId: guest.id,
        episodeId: 'ep-1',
        notionGuestUrl: guest.notionUrl,
        notionEpisodeUrl: 'https://app.notion.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        matchMethod: 'exact_youtube_video',
        youtubeAuthorName: 'إذاعة مختلف',
        youtubeAuthorTrust: 'owned',
      },
    ],
    issues: [],
    counts: {
      notionGuests: 1,
      notionPublishedEpisodeRecords: 1,
      notionYoutubeEpisodeRecords: 1,
      approvedYoutubeEvidenceRecords: 1,
      ownedYoutubeEvidenceRecords: 1,
      externalYoutubeEvidenceRecords: 0,
      notionGuestRelations: 1,
      supabasePublishedEpisodes: 1,
      matchedEpisodeRecords: 1,
      plannedGuests: 1,
      plannedAppearances: 1,
      matchedOwnedAuthorRecords: 1,
      matchedExternalAuthorRecords: 0,
      sanitizedFieldCount: 0,
      duplicateNormalizedNameGroups: 0,
      byMethod: {
        exact_youtube_video: 1,
        strong_youtube_title_evidence: 0,
        show_date_all_guest_tokens: 0,
        show_unique_all_guest_tokens_without_date: 0,
      },
      issues: {
        ambiguous: 0,
        missing_date: 0,
        missing_guest_relation: 0,
        missing_product_mapping: 0,
        missing_youtube_url: 0,
        missing_youtube_evidence: 0,
        external_author_without_strong_title_evidence: 0,
        target_collision: 0,
        unmatched: 0,
      },
    },
  };
}

const empty: ExistingGuestData = { guests: [], socials: [], appearances: [] };

describe('guarded guest import apply', () => {
  it('accounts for every social source and deduplicates only equivalent handles', () => {
    const guest = plannedGuest({
      publicSocialSources: [
        'https://x.com/mohammed',
        'https://twitter.com/mohammed',
        'http://instagram.com/mohammed',
        'https://localhost/profile',
      ],
    });
    const audit = auditSocialSources([guest]);
    expect(audit.sourceCount).toBe(4);
    expect(audit.decisions).toHaveLength(4);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ platform: 'x', handle: 'mohammed' });
    expect(audit.decisions.filter((decision) => decision.status === 'planned')).toHaveLength(1);
    expect(audit.decisions.map((decision) => decision.reason).filter(Boolean)).toEqual(
      expect.arrayContaining(['duplicate_source', 'not_a_single_https_url', 'unsafe_website_host']),
    );
  });

  it('defers only the conflicted platform without blocking the guest', () => {
    const importPlan = plan(
      plannedGuest({
        publicSocialSources: [
          'https://instagram.com/person-one',
          'https://instagram.com/person-two',
        ],
      }),
    );
    const audit = auditSocialSources(importPlan.guests);
    expect(audit.conflicts).toHaveLength(1);
    expect(audit.decisions.every((decision) => decision.status === 'skipped')).toBe(true);
    const delta = computeApplyDelta(importPlan, empty);
    expect(delta.guests).toHaveLength(1);
    expect(delta.appearances).toHaveLength(1);
    expect(delta.socials).toEqual([]);
    expect(delta.socialAudit.conflicts).toHaveLength(1);
  });

  it('produces an idempotent zero-write rerun for the exact planned state', () => {
    const importPlan = plan();
    const first = computeApplyDelta(importPlan, empty);
    expect(first.guests).toHaveLength(1);
    expect(first.socials).toHaveLength(1);
    expect(first.appearances).toHaveLength(1);

    const existing: ExistingGuestData = {
      guests: first.guests,
      socials: first.socials,
      appearances: first.appearances,
    };
    const rerun = computeApplyDelta(importPlan, existing);
    expect(rerun.guests).toEqual([]);
    expect(rerun.socials).toEqual([]);
    expect(rerun.appearances).toEqual([]);
    expect(() => assertPlanApplied(importPlan, existing)).not.toThrow();
  });

  it('hard-fails unexpected guest fields, stale socials, and stale appearances', () => {
    const importPlan = plan();
    const expected = computeApplyDelta(importPlan, empty);
    const exactGuest = expected.guests[0];
    expect(() =>
      computeApplyDelta(importPlan, {
        guests: [{ ...exactGuest, email: 'unexpected@example.com' }],
        socials: [],
        appearances: [],
      }),
    ).toThrow(/guest ID or slug conflict/);
    expect(() =>
      computeApplyDelta(importPlan, {
        guests: [exactGuest],
        socials: [
          ...expected.socials,
          {
            id: 'gsoc-stale',
            guest_id: exactGuest.id,
            platform: 'linkedin',
            handle: 'in/stale',
          },
        ],
        appearances: expected.appearances,
      }),
    ).toThrow(/stale social/);
    expect(() =>
      computeApplyDelta(importPlan, {
        guests: [exactGuest],
        socials: expected.socials,
        appearances: [
          ...expected.appearances,
          { guest_id: exactGuest.id, episode_id: 'ep-unexpected' },
        ],
      }),
    ).toThrow(/Unexpected existing appearance/);
  });

  it('builds one rollback-on-conflict transaction with published-target guards', () => {
    const importPlan = plan(plannedGuest({ name: "O'Reilly" }));
    const delta = computeApplyDelta(importPlan, empty);
    const sql = transactionalSql(importPlan, delta);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain('LOCK TABLE public.episodes IN SHARE MODE;');
    expect(sql).toContain("episode.status = 'published'");
    expect(sql).toContain('Unexpected existing guest ID, slug, or field state');
    expect(sql).toContain('Unexpected existing guest social state');
    expect(sql).toContain('Unexpected existing guest appearance state');
    expect(sql).toContain("O''Reilly");
    expect(sql).toContain('NULL');
    expect(sql).not.toMatch(/\b(?:delete|update)\b/i);
    expect(sql).not.toContain('ON CONFLICT');
  });

  it('refuses null bytes before generating SQL literals', () => {
    const importPlan = plan(plannedGuest({ bio: 'unsafe\0value' }));
    const delta = computeApplyDelta(importPlan, empty);
    expect(() => transactionalSql(importPlan, delta)).toThrow(/null byte/);
  });
});
