import { describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { createSupabaseRepository } from './supabase';

type Row = Record<string, unknown>;

interface Scenario {
  liveRow: Row;
  didRead: boolean;
  afterRead: (row: Row) => void;
}

class FakeArticlesQuery {
  private patch?: Row;
  private readonly filters: Array<{
    operator: 'eq' | 'is';
    column: string;
    value: unknown;
  }> = [];

  constructor(private readonly scenario: Scenario) {}

  update(patch: Row) {
    this.patch = patch;
    return this;
  }

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ operator: 'eq', column, value });
    return this;
  }

  is(column: string, value: null) {
    this.filters.push({ operator: 'is', column, value });
    return this;
  }

  async maybeSingle() {
    const matches = this.filters.every(({ operator, column, value }) =>
      operator === 'is'
        ? this.scenario.liveRow[column] == null && value === null
        : this.scenario.liveRow[column] === value,
    );
    if (!matches) return { data: null, error: null };

    if (this.patch) {
      Object.assign(this.scenario.liveRow, this.patch);
      return { data: structuredClone(this.scenario.liveRow), error: null };
    }

    const snapshot = structuredClone(this.scenario.liveRow);
    if (!this.scenario.didRead) {
      this.scenario.didRead = true;
      this.scenario.afterRead(this.scenario.liveRow);
    }
    return { data: snapshot, error: null };
  }
}

function articleRow(): Row {
  return {
    id: 'art-race',
    slug: 'article-race',
    title_ar: 'عنوان قديم',
    title_en: null,
    author_type: 'custom',
    author_display_name: 'فريق مختلف',
    author_studio_member_id: null,
    author_placement: 'after_title',
    excerpt_ar: 'ملخص',
    body_ar: 'محتوى',
    cover_url: null,
    cover_alt: null,
    content_json: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'محتوى' }] }],
    },
    content_html: '<p>محتوى</p>',
    seo_title: null,
    seo_description: null,
    canonical_url: null,
    social_title: null,
    social_description: null,
    social_image_url: null,
    no_index: false,
    status: 'draft',
    published_at: null,
    newsletter_enabled: true,
    newsletter_subject: 'موضوع',
    newsletter_preheader: null,
    newsletter_status: 'draft',
    mailchimp_campaign_id: null,
    newsletter_synced_version: null,
    newsletter_sync_started_at: null,
    newsletter_sync_token: null,
    newsletter_sent_at: null,
    version: 1,
    created_at: '2026-08-17T10:00:00.000Z',
    updated_at: '2026-08-17T10:00:00.000Z',
  };
}

function repositoryFor(scenario: Scenario) {
  createClientMock.mockReturnValue({
    from: () => new FakeArticlesQuery(scenario),
  });
  return createSupabaseRepository('https://project.supabase.co', 'service-role-key');
}

describe('Supabase article operational CAS', () => {
  it('cannot overwrite a concurrent first-campaign sync claim with a stale full-row save', async () => {
    const scenario: Scenario = {
      liveRow: articleRow(),
      didRead: false,
      afterRead: (row) => {
        row.newsletter_status = 'syncing';
        row.newsletter_sync_started_at = '2026-08-17T10:01:00.000Z';
        row.newsletter_sync_token = 'claim-token';
      },
    };

    const result = await repositoryFor(scenario).updateArticle('art-race', {
      expectedVersion: 1,
      titleAr: 'عنوان جديد',
    });

    expect(result).toBeNull();
    expect(scenario.liveRow).toMatchObject({
      title_ar: 'عنوان قديم',
      newsletter_status: 'syncing',
      newsletter_sync_started_at: '2026-08-17T10:01:00.000Z',
      newsletter_sync_token: 'claim-token',
    });
  });

  it('cannot overwrite a reclaimed sync lease when the status itself stays syncing', async () => {
    const liveRow = articleRow();
    liveRow.newsletter_status = 'syncing';
    liveRow.newsletter_sync_started_at = '2026-08-17T09:50:00.000Z';
    liveRow.newsletter_sync_token = 'old-token';
    const scenario: Scenario = {
      liveRow,
      didRead: false,
      afterRead: (row) => {
        row.newsletter_sync_started_at = '2026-08-17T10:01:00.000Z';
        row.newsletter_sync_token = 'new-token';
      },
    };

    const result = await repositoryFor(scenario).updateArticle('art-race', {
      expectedVersion: 1,
      titleAr: 'عنوان جديد',
    });

    expect(result).toBeNull();
    expect(scenario.liveRow).toMatchObject({
      title_ar: 'عنوان قديم',
      newsletter_status: 'syncing',
      newsletter_sync_started_at: '2026-08-17T10:01:00.000Z',
      newsletter_sync_token: 'new-token',
    });
  });

  it('cannot erase a campaign ID persisted after the article snapshot was read', async () => {
    const liveRow = articleRow();
    liveRow.newsletter_status = 'syncing';
    liveRow.newsletter_sync_started_at = '2026-08-17T10:00:30.000Z';
    liveRow.newsletter_sync_token = 'claim-token';
    const scenario: Scenario = {
      liveRow,
      didRead: false,
      afterRead: (row) => {
        row.mailchimp_campaign_id = 'campaign-created-remotely';
      },
    };

    const result = await repositoryFor(scenario).updateArticle('art-race', {
      expectedVersion: 1,
      titleAr: 'عنوان جديد',
    });

    expect(result).toBeNull();
    expect(scenario.liveRow).toMatchObject({
      title_ar: 'عنوان قديم',
      newsletter_status: 'syncing',
      mailchimp_campaign_id: 'campaign-created-remotely',
      newsletter_sync_token: 'claim-token',
    });
  });

  it('claims only the exact campaign and article version that the operator confirmed', async () => {
    const liveRow = articleRow();
    liveRow.newsletter_status = 'campaign_created';
    liveRow.mailchimp_campaign_id = 'campaign-confirmed';
    liveRow.newsletter_synced_version = 1;
    const scenario: Scenario = {
      liveRow,
      didRead: false,
      afterRead: (row) => {
        row.mailchimp_campaign_id = 'campaign-replaced';
      },
    };

    const result = await repositoryFor(scenario).claimArticleNewsletterSend(
      'art-race',
      1,
      'campaign-confirmed',
    );

    expect(result.status).toBe('confirmation_stale');
    expect(scenario.liveRow).toMatchObject({
      newsletter_status: 'campaign_created',
      mailchimp_campaign_id: 'campaign-replaced',
    });
  });

  it('does not acquire a sync lease after the confirmed article version changes', async () => {
    const scenario: Scenario = {
      liveRow: articleRow(),
      didRead: false,
      afterRead: (row) => {
        row.version = 2;
        row.title_ar = 'عنوان أحدث';
      },
    };

    const result = await repositoryFor(scenario).claimArticleNewsletterSync('art-race', 1);

    expect(result.status).toBe('version_conflict');
    expect(scenario.liveRow).toMatchObject({
      version: 2,
      title_ar: 'عنوان أحدث',
      newsletter_status: 'draft',
      newsletter_sync_token: null,
    });
  });

  it('recovers a stale send lease with a compare-and-swap on its private token', async () => {
    const liveRow = articleRow();
    liveRow.newsletter_status = 'sending';
    liveRow.mailchimp_campaign_id = 'campaign-confirmed';
    liveRow.newsletter_synced_version = 1;
    liveRow.newsletter_send_started_at = '2026-08-17T09:00:00.000Z';
    liveRow.newsletter_send_token = 'stale-send-token';
    const scenario: Scenario = { liveRow, didRead: false, afterRead: () => undefined };

    const recovered = await repositoryFor(scenario).recoverStaleArticleNewsletterSend(
      'art-race',
      '2026-08-17T09:30:00.000Z',
    );

    expect(recovered?.newsletter.status).toBe('campaign_created');
    expect(scenario.liveRow).toMatchObject({
      newsletter_status: 'campaign_created',
      newsletter_send_started_at: null,
      newsletter_send_token: null,
    });
  });

  it('cannot recover a send lease that was renewed after it was observed', async () => {
    const liveRow = articleRow();
    liveRow.newsletter_status = 'sending';
    liveRow.mailchimp_campaign_id = 'campaign-confirmed';
    liveRow.newsletter_synced_version = 1;
    liveRow.newsletter_send_started_at = '2026-08-17T09:00:00.000Z';
    liveRow.newsletter_send_token = 'observed-send-token';
    const scenario: Scenario = {
      liveRow,
      didRead: false,
      afterRead: (row) => {
        row.newsletter_send_started_at = '2026-08-17T09:31:00.000Z';
        row.newsletter_send_token = 'renewed-send-token';
      },
    };

    const recovered = await repositoryFor(scenario).recoverStaleArticleNewsletterSend(
      'art-race',
      '2026-08-17T09:30:00.000Z',
    );

    expect(recovered).toBeNull();
    expect(scenario.liveRow).toMatchObject({
      newsletter_status: 'sending',
      newsletter_send_started_at: '2026-08-17T09:31:00.000Z',
      newsletter_send_token: 'renewed-send-token',
    });
  });
});

describe('Supabase article author directory', () => {
  it('normalizes valid names and filters unusable legacy Studio members', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: 'member-valid', display_name: '  اسم صالح  ' },
        { id: 'member-nfc', display_name: 'Cafe\u0301' },
        { id: 'member-short', display_name: 'أ' },
        { id: 'member-blank', display_name: '   ' },
        { id: 'member-control', display_name: 'اسم\nثان' },
        { id: 'member-bidi', display_name: 'اسم\u202eمخفي' },
        { id: 'member-long', display_name: 'x'.repeat(101) },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    createClientMock.mockReturnValue({ from });

    const candidates = await createSupabaseRepository(
      'https://project.supabase.co',
      'service-role-key',
    ).listArticleAuthorCandidates();

    expect(candidates).toEqual([
      { studioMemberId: 'member-valid', displayName: 'اسم صالح' },
      { studioMemberId: 'member-nfc', displayName: 'Café' },
    ]);
    expect(from).toHaveBeenCalledWith('studio_members');
    expect(select).toHaveBeenCalledWith('id, display_name');
    expect(order).toHaveBeenCalledWith('display_name');
  });
});
