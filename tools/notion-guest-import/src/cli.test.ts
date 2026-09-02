import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { GuestImportPlan } from './core.ts';
import {
  assertDevelopmentSupabaseOrigin,
  assertReviewedPlanMatchesCatalogue,
  parseArguments,
  validateOptions,
  verifyReviewedHashes,
} from './cli.ts';

const PROJECT_REF = 'pacpdxvujkjvnaeeuute';

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function corePlan(): GuestImportPlan {
  return {
    schemaVersion: 1,
    mode: 'dry-run',
    source: 'notion-guest-library',
    guests: [],
    appearances: [],
    issues: [],
    counts: {
      notionGuests: 0,
      notionPublishedEpisodeRecords: 0,
      notionYoutubeEpisodeRecords: 0,
      approvedYoutubeEvidenceRecords: 0,
      ownedYoutubeEvidenceRecords: 0,
      externalYoutubeEvidenceRecords: 0,
      notionGuestRelations: 0,
      supabasePublishedEpisodes: 0,
      matchedEpisodeRecords: 0,
      plannedGuests: 0,
      plannedAppearances: 0,
      matchedOwnedAuthorRecords: 0,
      matchedExternalAuthorRecords: 0,
      sanitizedFieldCount: 0,
      duplicateNormalizedNameGroups: 0,
      byMethod: {
        exact_youtube_video: 0,
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

function reviewedArtifacts() {
  const snapshotBytes = Buffer.from('{"snapshot":true}\n');
  const youtubeCacheBytes = Buffer.from('{"cache":true}\n');
  const plan = {
    ...corePlan(),
    generatedAt: '2026-09-02T00:00:00.000Z',
    snapshotSha256: digest(snapshotBytes),
    youtubeEvidenceSha256: digest(youtubeCacheBytes),
    supabaseProjectRef: PROJECT_REF,
  };
  const planBytes = Buffer.from(`${JSON.stringify(plan)}\n`);
  return { planBytes, snapshotBytes, youtubeCacheBytes };
}

describe('guest importer CLI safety policy', () => {
  it('accepts only the exact development Supabase hostname before any network use', () => {
    expect(assertDevelopmentSupabaseOrigin(`https://${PROJECT_REF}.supabase.co`).hostname).toBe(
      `${PROJECT_REF}.supabase.co`,
    );
    for (const malicious of [
      `https://${PROJECT_REF}.supabase.co.evil.example`,
      `https://${PROJECT_REF}.supabase.co@evil.example`,
      `http://${PROJECT_REF}.supabase.co`,
      `https://${PROJECT_REF}.supabase.co/rest/v1`,
    ]) {
      expect(() => assertDevelopmentSupabaseOrigin(malicious)).toThrow(/locked/);
    }
  });

  it('requires both exact apply confirmations and distinct artifact paths', () => {
    expect(() => validateOptions(parseArguments(['--apply']))).toThrow(/confirm-project/);
    const confirmed = parseArguments([
      '--apply',
      '--confirm-project',
      PROJECT_REF,
      '--confirm-plan-sha256',
      'a'.repeat(64),
    ]);
    expect(() => validateOptions(confirmed)).not.toThrow();
    expect(() =>
      validateOptions(parseArguments(['--input', '/tmp/same.json', '--plan', '/tmp/same.json'])),
    ).toThrow(/distinct/);
  });

  it('rejects any plan, snapshot, or evidence hash drift', () => {
    const artifacts = reviewedArtifacts();
    expect(() =>
      verifyReviewedHashes(
        artifacts.planBytes,
        artifacts.snapshotBytes,
        artifacts.youtubeCacheBytes,
        digest(artifacts.planBytes),
      ),
    ).not.toThrow();
    expect(() =>
      verifyReviewedHashes(
        artifacts.planBytes,
        artifacts.snapshotBytes,
        artifacts.youtubeCacheBytes,
        '0'.repeat(64),
      ),
    ).toThrow(/plan SHA-256/);
    expect(() =>
      verifyReviewedHashes(
        artifacts.planBytes,
        Buffer.from('changed'),
        artifacts.youtubeCacheBytes,
        digest(artifacts.planBytes),
      ),
    ).toThrow(/snapshot no longer matches/);
    expect(() =>
      verifyReviewedHashes(
        artifacts.planBytes,
        artifacts.snapshotBytes,
        Buffer.from('changed'),
        digest(artifacts.planBytes),
      ),
    ).toThrow(/evidence no longer matches/);
  });

  it('blocks a reviewed plan when the current published catalogue rebuild differs', () => {
    const reviewed = corePlan();
    const rebuilt = structuredClone(reviewed);
    rebuilt.counts.supabasePublishedEpisodes = 1;
    expect(() => assertReviewedPlanMatchesCatalogue(reviewed, reviewed)).not.toThrow();
    expect(() => assertReviewedPlanMatchesCatalogue(reviewed, rebuilt)).toThrow(/stale/);
  });
});
