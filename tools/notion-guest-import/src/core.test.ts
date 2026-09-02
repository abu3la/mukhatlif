import { describe, expect, it } from 'vitest';
import {
  PRODUCT_TO_SHOW_ID,
  buildGuestImportPlan,
  parseSanitizedNotionSnapshot,
  titleEvidence,
  type SanitizedNotionSnapshot,
  type SupabasePublishedEpisode,
  type YouTubeEvidence,
} from './core.ts';

const PRODUCT_URL = Object.entries(PRODUCT_TO_SHOW_ID).find(([, id]) => id === 'shw-petroly')![0];
const guestUrl = 'https://app.notion.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const videoId = 'AbCdEf12345';

function snapshot(episode: Partial<SanitizedNotionSnapshot['publishedEpisodes'][number]> = {}) {
  return {
    schemaVersion: 2 as const,
    source: 'Notion test',
    capturedAt: '2026-09-02T00:00:00.000Z',
    episodeStatusFilter: 'نشرت' as const,
    privacy: { included: ['public name'], excluded: ['email', 'phone'] },
    counts: { guests: 1, publishedEpisodeRelations: 1 },
    guests: [
      {
        url: guestUrl,
        'اسم الضيف': 'محمد الخضر',
        'المسمى التعريفي': 'خبير مبيعات',
        المدينة: 'الرياض',
        'حسابات الضيف': 'https://linkedin.com/in/example',
        'صورة الضيف': null,
        'عن الضيف ': 'نبذة عامة',
      },
    ],
    publishedEpisodes: [
      {
        url: 'https://app.notion.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'عنوان الصفحة': 'محمد الخضر في بترولي',
        'رابط الحلقة': `https://www.youtube.com/watch?v=${videoId}`,
        'date:تاريخ النشر :start': '2026-08-31',
        'اسم الضيف': JSON.stringify([guestUrl]),
        المنتج: JSON.stringify([PRODUCT_URL]),
        'userDefined:ID': 10,
        ...episode,
      },
    ],
  } satisfies SanitizedNotionSnapshot;
}

function episode(overrides: Partial<SupabasePublishedEpisode> = {}): SupabasePublishedEpisode {
  return {
    id: 'ep-1',
    show_id: 'shw-petroly',
    title_ar: 'كيف تبني حضورك المهني',
    show_notes_ar: 'نستضيف محمد الخضر خبير المبيعات.',
    publish_at: '2026-08-31T10:00:00.000Z',
    legacy_url: null,
    source_url: null,
    audio_url: null,
    status: 'published',
    ...overrides,
  };
}

function evidence(title = 'عنوان يوتيوب مختلف', authorName = 'إذاعة مختلف') {
  return new Map<string, YouTubeEvidence>([[videoId, { videoId, title, authorName }]]);
}

describe('Notion guest migration dry run', () => {
  it('matches by show, exact date, and all related guest-name tokens', () => {
    const plan = buildGuestImportPlan(
      snapshot(),
      [episode(), episode({ id: 'ep-2', title_ar: 'حلقة أخرى', show_notes_ar: 'ضيف مختلف' })],
      evidence(),
    );
    expect(plan.counts).toMatchObject({
      matchedEpisodeRecords: 1,
      plannedGuests: 1,
      plannedAppearances: 1,
    });
    expect(plan.counts.byMethod.show_date_all_guest_tokens).toBe(1);
    expect(plan.appearances[0]).toMatchObject({ episodeId: 'ep-1' });
  });

  it('uses an exact YouTube video ID before title evidence', () => {
    const plan = buildGuestImportPlan(
      snapshot({
        'رابط الحلقة': `https://youtu.be/${videoId}?si=tracking`,
        'date:تاريخ النشر :start': null,
      }),
      [episode({ source_url: `https://www.youtube.com/watch?v=${videoId}`, publish_at: null })],
      evidence(),
    );
    expect(plan.counts.byMethod.exact_youtube_video).toBe(1);
  });

  it('requires an explicit YouTube video URL from Notion', () => {
    const missing = buildGuestImportPlan(
      snapshot({ 'رابط الحلقة': null }),
      [episode()],
      evidence(),
    );
    const wrongHost = buildGuestImportPlan(
      snapshot({ 'رابط الحلقة': `https://youtube.com.example.test/watch?v=${videoId}` }),
      [episode()],
      evidence(),
    );
    expect(missing.counts.issues.missing_youtube_url).toBe(1);
    expect(wrongHost.counts.issues.missing_youtube_url).toBe(1);
  });

  it('requires successful oEmbed evidence and rejects weak external-author evidence', () => {
    const missing = buildGuestImportPlan(snapshot(), [episode()], new Map());
    const weakExternal = buildGuestImportPlan(
      snapshot(),
      [episode()],
      evidence('العنوان', 'قناة أخرى'),
    );
    expect(missing.counts.issues.missing_youtube_evidence).toBe(1);
    expect(weakExternal.counts.issues.external_author_without_strong_title_evidence).toBe(1);
  });

  it('accepts an external author only through strong title evidence in the mapped show', () => {
    const accepted = buildGuestImportPlan(
      snapshot(),
      [episode()],
      evidence('كيف تبني حضورك المهني | بودكاست بترولي', 'KFUPM Media club'),
    );
    expect(accepted.counts.matchedExternalAuthorRecords).toBe(1);
    expect(accepted.appearances[0]).toMatchObject({
      youtubeAuthorName: 'KFUPM Media club',
      youtubeAuthorTrust: 'external',
      matchMethod: 'strong_youtube_title_evidence',
    });

    const exactVideoButWeakTitle = buildGuestImportPlan(
      snapshot(),
      [episode({ source_url: `https://youtube.com/watch?v=${videoId}` })],
      evidence('عنوان خارجي غير مطابق', 'KFUPM Media club'),
    );
    expect(exactVideoButWeakTitle.counts.matchedEpisodeRecords).toBe(0);
  });

  it('treats the documented Mukhtalif channel family as owned', () => {
    const accepted = buildGuestImportPlan(
      snapshot(),
      [episode()],
      evidence('عنوان', 'ريادي مختلف'),
    );
    expect(accepted.counts.byMethod.show_date_all_guest_tokens).toBe(1);
    expect(accepted.appearances[0]).toMatchObject({
      youtubeAuthorName: 'ريادي مختلف',
      youtubeAuthorTrust: 'owned',
    });
  });

  it('accepts strong YouTube-title evidence within the mapped show', () => {
    const plan = buildGuestImportPlan(
      snapshot({ 'date:تاريخ النشر :start': '2020-01-01' }),
      [episode()],
      evidence('كيف تبني حضورك المهني | بودكاست بترولي'),
    );
    expect(plan.counts.byMethod.strong_youtube_title_evidence).toBe(1);
  });

  it('never accepts date-only evidence', () => {
    const plan = buildGuestImportPlan(
      snapshot({ 'عنوان الصفحة': 'كارثة الـ60% في إدارة المشاريع' }),
      [episode({ title_ar: 'من القضاء إلى الإرشاد الأسري', show_notes_ar: 'موضوع مختلف' })],
      evidence('كارثة الـ60% في إدارة المشاريع'),
    );
    expect(plan.counts.matchedEpisodeRecords).toBe(0);
    expect(plan.counts.issues.unmatched).toBe(1);
  });

  it('accepts a unique full guest-token match within a show only when the date is absent', () => {
    const plan = buildGuestImportPlan(
      snapshot({ 'date:تاريخ النشر :start': null }),
      [episode(), episode({ id: 'ep-2', show_notes_ar: 'ضيف مختلف' })],
      evidence(),
    );
    expect(plan.counts.byMethod.show_unique_all_guest_tokens_without_date).toBe(1);
  });

  it('clears source error placeholders from editorial fields and reports the cleanup', () => {
    const source = snapshot();
    source.guests[0]['المسمى التعريفي'] = 'Something went wrong. Try again.';
    source.guests[0]['المدينة'] = 'حدث خطأ ما. حاول مرة أخرى.';
    source.guests[0]['عن الضيف '] = 'Something went wrong please try again';
    const plan = buildGuestImportPlan(source, [episode()], evidence('كيف تبني حضورك المهني'));
    expect(plan.guests[0]).toMatchObject({ name: 'محمد الخضر', role: '', city: '', bio: '' });
    expect(plan.counts.sanitizedFieldCount).toBe(3);
  });

  it('keeps duplicate normalized names as distinct canonical Notion identities', () => {
    const source = snapshot();
    const secondGuestUrl = 'https://app.notion.com/dddddddddddddddddddddddddddddddd';
    source.guests.push({ ...source.guests[0], url: secondGuestUrl });
    source.counts.guests = 2;
    source.publishedEpisodes[0]['اسم الضيف'] = JSON.stringify([guestUrl, secondGuestUrl]);
    const plan = buildGuestImportPlan(source, [episode()], evidence('كيف تبني حضورك المهني'));
    expect(plan.guests).toHaveLength(2);
    expect(new Set(plan.guests.map((guest) => guest.id))).toHaveProperty('size', 2);
    expect(plan.appearances).toHaveLength(2);
    expect(plan.counts.duplicateNormalizedNameGroups).toBe(1);
  });

  it('rejects a non-unique guest-token match and never plans its guest', () => {
    const plan = buildGuestImportPlan(snapshot(), [episode(), episode({ id: 'ep-2' })], evidence());
    expect(plan.counts.matchedEpisodeRecords).toBe(0);
    expect(plan.counts.issues.ambiguous).toBe(1);
    expect(plan.guests).toEqual([]);
  });

  it('removes target collisions between two distinct Notion episode records', () => {
    const source = snapshot();
    source.publishedEpisodes.push({
      ...source.publishedEpisodes[0],
      url: 'https://app.notion.com/cccccccccccccccccccccccccccccccc',
      'userDefined:ID': 11,
    });
    source.counts.publishedEpisodeRelations = 2;
    const plan = buildGuestImportPlan(source, [episode()], evidence('كيف تبني حضورك المهني'));
    expect(plan.counts.matchedEpisodeRecords).toBe(0);
    expect(plan.counts.issues.target_collision).toBe(2);
  });

  it('rejects every non-allowlisted snapshot field', () => {
    const unsafe = snapshot() as unknown as Record<string, unknown>;
    (unsafe.guests as Array<Record<string, unknown>>)[0].الايميل = 'private@example.com';
    expect(() => parseSanitizedNotionSnapshot(unsafe)).toThrow(/privacy allowlist/);
  });

  it('rejects duplicate canonical Notion page IDs', () => {
    const duplicate = snapshot();
    duplicate.guests.push({ ...duplicate.guests[0] });
    duplicate.counts.guests = 2;
    expect(() => parseSanitizedNotionSnapshot(duplicate)).toThrow(/duplicate canonical guest/);
  });

  it('uses conservative title evidence thresholds', () => {
    expect(
      titleEvidence(
        'بين نادي الاتحاد والبزنس: إدارة الأزمات وتوريث النجاح | بودكاست بترولي',
        'بين نادي الاتحاد والبزنس: إدارة الأزمات وتوريث النجاح',
      ).strong,
    ).toBe(true);
    expect(
      titleEvidence('كارثة الـ60% في إدارة المشاريع', 'من القضاء إلى الإرشاد الأسري').strong,
    ).toBe(false);
  });
});
