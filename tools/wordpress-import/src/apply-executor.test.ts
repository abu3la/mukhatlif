import { describe, expect, it } from 'vitest';
import { executeWordPressApplyPlan } from './apply-executor.ts';
import type { WordPressApplyPlan } from './apply-plan.ts';
import type { RestDatabase, RestValue } from './database.ts';

type Row = Record<string, unknown>;

interface RecordedWrite {
  table: string;
  kind: 'insert' | 'update';
  rows?: Row[];
  values?: Row;
  filters?: Readonly<Record<string, RestValue>>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function matches(row: Row, filters: Readonly<Record<string, RestValue>>): boolean {
  return Object.entries(filters).every(([field, value]) => row[field] === value);
}

class FakeRestDatabase implements RestDatabase {
  readonly writes: RecordedWrite[] = [];
  readonly #tables = new Map<string, Row[]>();

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.#tables.set(table, clone(rows));
  }

  async select(
    table: string,
    _columns = '*',
    filters: Readonly<Record<string, RestValue>> = {},
  ): Promise<Row[]> {
    return clone((this.#tables.get(table) ?? []).filter((row) => matches(row, filters)));
  }

  async insert(table: string, rows: ReadonlyArray<Row>): Promise<void> {
    const inserted = clone([...rows]);
    this.#tables.set(table, [...(this.#tables.get(table) ?? []), ...inserted]);
    this.writes.push({ table, kind: 'insert', rows: inserted });
  }

  async update(
    table: string,
    values: Row,
    filters: Readonly<Record<string, RestValue>>,
  ): Promise<void> {
    const rows = this.#tables.get(table) ?? [];
    for (const row of rows) {
      if (matches(row, filters)) Object.assign(row, clone(values));
    }
    this.writes.push({
      table,
      kind: 'update',
      values: clone(values),
      filters: clone(filters),
    });
  }

  clearWrites(): void {
    this.writes.length = 0;
  }

  edit(table: string, filters: Readonly<Record<string, RestValue>>, values: Row): void {
    const row = (this.#tables.get(table) ?? []).find((candidate) => matches(candidate, filters));
    if (!row) throw new Error(`No ${table} row matches the requested direct edit`);
    Object.assign(row, clone(values));
  }

  rows(table: string): Row[] {
    return clone(this.#tables.get(table) ?? []);
  }
}

const SOURCE_ID = 'wordpress:mukhtalif.net';
const MEDIA_ID = 'med-11111111111111111111111111111111';
const ARTICLE_ID = 'art-wp-101';
const SOURCE_CHECKSUM = 'a'.repeat(64);
const MANIFEST_CHECKSUM = 'b'.repeat(64);
const FIRST_ARTICLE_CHECKSUM = 'c'.repeat(64);
const SECOND_ARTICLE_CHECKSUM = 'd'.repeat(64);

function importedRecord(options: {
  entityType: 'attachment' | 'post';
  legacyId: number;
  targetKind: 'media' | 'article';
  targetId: string;
  sourceChecksumSha256: string;
}) {
  return {
    source_id: SOURCE_ID,
    entity_type: options.entityType,
    legacy_key: String(options.legacyId),
    legacy_numeric_id: options.legacyId,
    legacy_slug: `${options.entityType}-${options.legacyId}`,
    legacy_url: `https://mukhtalif.net/?p=${options.legacyId}`,
    target_kind: options.targetKind,
    target_id: options.targetId,
    source_checksum_sha256: options.sourceChecksumSha256,
    import_status: 'imported' as const,
    metadata: { fixture: true },
    imported_at: null,
  };
}

function makePlan(
  options: {
    articleTitle?: string;
    articleExcerpt?: string;
    articleChecksum?: string;
    redirects?: Row[];
  } = {},
): WordPressApplyPlan {
  const articleTitle = options.articleTitle ?? 'عنوان ووردبريس';
  const articleExcerpt = options.articleExcerpt ?? 'ملخص ووردبريس';
  const articleChecksum = options.articleChecksum ?? FIRST_ARTICLE_CHECKSUM;
  const draft = {
    schemaVersion: 2 as const,
    source: {
      id: SOURCE_ID,
      source_kind: 'wordpress_wxr' as const,
      source_url: 'https://mukhtalif.net',
      source_checksum_sha256: SOURCE_CHECKSUM,
      manifest_checksum_sha256: MANIFEST_CHECKSUM,
    },
    mediaStorage: {
      schemaVersion: 1 as const,
      deploymentEnvironment: 'development' as const,
      bucket: 'mukhtalif-media',
      prefix: 'legacy/wordpress',
      mediaPublicOrigin: 'https://media-development.example.com',
      mediaDownloadReportChecksumSha256: 'e'.repeat(64),
      r2VerificationReportChecksumSha256: 'f'.repeat(64),
      externalR2VerificationReportChecksumSha256: '0'.repeat(64),
      itemCount: 1,
      externalItemCount: 0,
    },
    people: [],
    mediaAssets: [
      {
        id: MEDIA_ID,
        row: {
          id: MEDIA_ID,
          kind: 'image',
          mime_type: 'image/jpeg',
          original_file_name: 'cover.jpg',
          storage_key: 'legacy/wordpress/201/cover.jpg',
          byte_size: 1_024,
          expected_byte_size: 1_024,
          width: 1_200,
          height: 630,
          default_alt: 'غلاف المقال',
          default_caption: null,
          status: 'ready',
          upload_started_at: null,
          upload_token: null,
        },
        legacyRecords: [
          importedRecord({
            entityType: 'attachment',
            legacyId: 201,
            targetKind: 'media',
            targetId: MEDIA_ID,
            sourceChecksumSha256: '1'.repeat(64),
          }),
        ],
        sourceChecksumSha256: '2'.repeat(64),
      },
    ],
    articles: [
      {
        id: ARTICLE_ID,
        row: {
          id: ARTICLE_ID,
          slug: 'legacy-article-101',
          title_ar: articleTitle,
          excerpt_ar: articleExcerpt,
          body_ar: 'نص المقال',
          cover_url: `https://media-development.example.com/media/${MEDIA_ID}`,
          cover_alt: 'غلاف المقال',
          status: 'published',
          updated_at: '2026-09-01T12:00:00.000Z',
          legacy_source_id: SOURCE_ID,
          legacy_post_id: 101,
          legacy_source_url: 'https://mukhtalif.net/legacy-article-101/',
          legacy_content_html: '<p>نص المقال</p>',
          legacy_source_checksum_sha256: articleChecksum,
          legacy_source_updated_at: '2026-09-01T11:00:00.000Z',
        },
        legacyRecords: [
          importedRecord({
            entityType: 'post',
            legacyId: 101,
            targetKind: 'article',
            targetId: ARTICLE_ID,
            sourceChecksumSha256: articleChecksum,
          }),
        ],
        sourceChecksumSha256: articleChecksum,
      },
    ],
    blockedArticles: [],
    articleDependencies: [],
    articleAuthors: [],
    books: [],
    pendingPages: [],
    pendingMedia: [],
    externalInlineMedia: [],
    redirects: options.redirects ?? [],
    excludedRedirects: [],
    warnings: [],
    errors: [],
    checksumSha256: '3'.repeat(64),
  } satisfies WordPressApplyPlan;
  return draft;
}

describe('WordPress apply reconciliation', () => {
  it('inserts imported media and content once, then performs zero mutations on an exact rerun', async () => {
    const database = new FakeRestDatabase();
    const plan = makePlan();

    const first = await executeWordPressApplyPlan({
      plan,
      database,
      apply: true,
      now: () => '2026-09-02T10:00:00.000Z',
    });

    expect(first).toMatchObject({
      applied: true,
      blocked: false,
      plannedMutations: 5,
      source: { inserted: 1 },
      mediaAssets: { inserted: 1 },
      articles: { inserted: 1 },
      legacyRecords: { inserted: 2 },
    });
    expect(database.rows('article_media_assets')).toEqual([
      expect.objectContaining({
        id: MEDIA_ID,
        storage_key: 'legacy/wordpress/201/cover.jpg',
        status: 'ready',
      }),
    ]);
    expect(database.rows('articles')).toEqual([
      expect.objectContaining({
        id: ARTICLE_ID,
        cover_url: `https://media-development.example.com/media/${MEDIA_ID}`,
      }),
    ]);

    database.clearWrites();
    const second = await executeWordPressApplyPlan({
      plan,
      database,
      apply: true,
      now: () => '2026-09-02T11:00:00.000Z',
    });

    expect(second).toMatchObject({
      applied: true,
      blocked: false,
      plannedMutations: 0,
      source: { unchanged: 1 },
      mediaAssets: { unchanged: 1 },
      articles: { unchanged: 1 },
      legacyRecords: { unchanged: 2 },
    });
    expect(database.writes).toEqual([]);
  });

  it('treats equivalent PostgREST timestamp serialization as an unchanged rerun', async () => {
    const database = new FakeRestDatabase();
    const plan = makePlan();

    await executeWordPressApplyPlan({
      plan,
      database,
      apply: true,
      now: () => '2026-09-02T10:00:00.000Z',
    });
    database.edit(
      'articles',
      { id: ARTICLE_ID },
      {
        updated_at: '2026-09-01T12:00:00+00:00',
        legacy_source_updated_at: '2026-09-01T11:00:00+00:00',
      },
    );
    database.clearWrites();

    const rerun = await executeWordPressApplyPlan({
      plan,
      database,
      apply: true,
      now: () => '2026-09-02T11:00:00.000Z',
    });

    expect(rerun).toMatchObject({
      applied: true,
      blocked: false,
      plannedMutations: 0,
      articles: { unchanged: 1, updated: 0, preservedFields: 0 },
      legacyRecords: { unchanged: 2 },
    });
    expect(database.writes).toEqual([]);
  });

  it('preserves a Studio-edited article field while advancing an untouched imported field', async () => {
    const database = new FakeRestDatabase();
    await executeWordPressApplyPlan({
      plan: makePlan(),
      database,
      apply: true,
      now: () => '2026-09-02T10:00:00.000Z',
    });
    database.edit('articles', { id: ARTICLE_ID }, { title_ar: 'عنوان عدّله الاستوديو' });
    database.clearWrites();

    const report = await executeWordPressApplyPlan({
      plan: makePlan({
        articleTitle: 'عنوان ووردبريس الجديد',
        articleExcerpt: 'ملخص ووردبريس المحدّث',
        articleChecksum: SECOND_ARTICLE_CHECKSUM,
      }),
      database,
      apply: true,
      now: () => '2026-09-02T12:00:00.000Z',
    });

    expect(report.articles).toMatchObject({ updated: 1, preservedFields: 1 });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'studio-fields-preserved',
        targetKind: 'article',
        targetId: ARTICLE_ID,
        fields: ['title_ar'],
      }),
    );
    expect(database.rows('articles')).toEqual([
      expect.objectContaining({
        title_ar: 'عنوان عدّله الاستوديو',
        excerpt_ar: 'ملخص ووردبريس المحدّث',
        legacy_source_checksum_sha256: SECOND_ARTICLE_CHECKSUM,
      }),
    ]);
    expect(database.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'articles',
          kind: 'update',
          values: expect.not.objectContaining({ title_ar: expect.anything() }),
        }),
      ]),
    );
  });

  it('blocks the whole apply when an article media target cannot be reconciled', async () => {
    const database = new FakeRestDatabase();
    const plan = makePlan();
    plan.mediaAssets = [];

    const report = await executeWordPressApplyPlan({
      plan,
      database,
      apply: true,
      now: () => '2026-09-02T10:00:00.000Z',
    });

    expect(report).toMatchObject({ applied: false, blocked: true });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'article-media-target-missing',
        targetId: ARTICLE_ID,
        fields: [MEDIA_ID],
      }),
    );
    expect(database.writes).toEqual([]);
  });

  it('keeps an existing conflicting redirect and does not write to the redirect table', async () => {
    const sourcePath = '/old-article/';
    const database = new FakeRestDatabase({
      url_redirects: [
        {
          source_path: sourcePath,
          destination: '/manually-curated-destination/',
          status_code: 302,
          is_active: true,
        },
      ],
    });
    const plan = makePlan({
      redirects: [
        {
          source_path: sourcePath,
          destination: '/articles/legacy-article-101/',
          status_code: 301,
          is_active: true,
        },
      ],
    });

    const report = await executeWordPressApplyPlan({
      plan,
      database,
      apply: true,
      now: () => '2026-09-02T10:00:00.000Z',
    });

    expect(report.redirects).toMatchObject({ conflicts: 1, skipped: 1, inserted: 0 });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: 'existing-redirect-preserved',
        targetKind: 'redirect',
        targetId: sourcePath,
      }),
    );
    expect(database.rows('url_redirects')).toEqual([
      {
        source_path: sourcePath,
        destination: '/manually-curated-destination/',
        status_code: 302,
        is_active: true,
      },
    ]);
    expect(database.writes.filter((write) => write.table === 'url_redirects')).toEqual([]);
  });
});
