import { checksumObject, stableStringify } from './hash.ts';
import type { RestDatabase, RestValue } from './database.ts';
import type {
  DatabaseRow,
  PlannedEntity,
  PlannedLegacyRecord,
  WordPressApplyPlan,
} from './apply-plan.ts';
import type { ArticleDependencyReport } from './article-dependencies.ts';

type TargetKind = 'person' | 'media' | 'article' | 'book';
type TargetTable = 'people' | 'article_media_assets' | 'articles' | 'books';

interface MutationCounter {
  planned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  conflicts: number;
  preservedFields: number;
}

export interface ApplyIssue {
  level: 'info' | 'warning' | 'error';
  code: string;
  targetKind: string;
  targetId: string | null;
  message: string;
  fields?: string[];
}

export interface WordPressApplyReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'database-dry-run' | 'apply';
  applied: boolean;
  blocked: boolean;
  planChecksumSha256: string;
  manifestChecksumSha256: string;
  source: MutationCounter;
  people: MutationCounter;
  mediaAssets: MutationCounter;
  articles: MutationCounter;
  blockedArticles: MutationCounter;
  articleAuthors: MutationCounter;
  books: MutationCounter;
  pendingPages: MutationCounter;
  pendingMedia: MutationCounter;
  legacyRecords: MutationCounter;
  redirects: MutationCounter;
  untouchedExistingRows: {
    people: number;
    mediaAssets: number;
    articles: number;
    books: number;
  };
  excludedRedirects: number;
  articleDependencies: ArticleDependencyReport[];
  plannedMutations: number;
  issues: ApplyIssue[];
}

interface Mutation {
  table: string;
  kind: 'insert' | 'update';
  row: DatabaseRow;
  filters?: Readonly<Record<string, RestValue>>;
}

interface State {
  sources: Map<string, DatabaseRow>;
  records: Map<string, DatabaseRow>;
  people: Map<string, DatabaseRow>;
  article_media_assets: Map<string, DatabaseRow>;
  articles: Map<string, DatabaseRow>;
  articleAuthors: Map<string, DatabaseRow>;
  books: Map<string, DatabaseRow>;
  redirects: Map<string, DatabaseRow>;
}

interface ReconcileContext {
  state: State;
  mutations: Mutation[];
  report: WordPressApplyReport;
  now: string;
  acceptedTargets: Record<TargetKind, Set<string>>;
}

interface EntityOptions {
  table: TargetTable;
  kind: TargetKind;
  counter: MutationCounter;
  entities: PlannedEntity[];
  managedFields?: ReadonlySet<string>;
  uniqueFields?: readonly string[];
}

const TABLE_ORDER = [
  'legacy_import_sources',
  'article_media_assets',
  'people',
  'articles',
  'books',
  'article_authors',
  'legacy_import_records',
  'url_redirects',
] as const;

const ARTICLE_PROVENANCE_FIELDS = new Set([
  'legacy_source_id',
  'legacy_post_id',
  'legacy_source_url',
  'legacy_content_html',
  'legacy_source_checksum_sha256',
  'legacy_source_updated_at',
]);

function counter(planned: number): MutationCounter {
  return {
    planned,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    conflicts: 0,
    preservedFields: 0,
  };
}

function rowKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} row has no string key`);
  return value;
}

function mapRows(rows: DatabaseRow[], key: string, label: string): Map<string, DatabaseRow> {
  const result = new Map<string, DatabaseRow>();
  for (const row of rows) {
    const value = rowKey(row[key], label);
    if (result.has(value)) throw new Error(`${label} contains duplicate key ${value}`);
    result.set(value, row);
  }
  return result;
}

function recordKey(sourceId: unknown, entityType: unknown, legacyKey: unknown): string {
  return `${String(sourceId)}\u0000${String(entityType)}\u0000${String(legacyKey)}`;
}

function mapRecords(rows: DatabaseRow[]): Map<string, DatabaseRow> {
  const result = new Map<string, DatabaseRow>();
  for (const row of rows) {
    const key = recordKey(row.source_id, row.entity_type, row.legacy_key);
    if (result.has(key)) throw new Error(`Legacy ledger contains duplicate key ${key}`);
    result.set(key, row);
  }
  return result;
}

function authorKey(articleId: unknown, personId: unknown): string {
  return `${String(articleId)}\u0000${String(personId)}`;
}

function mapArticleAuthors(rows: DatabaseRow[]): Map<string, DatabaseRow> {
  const result = new Map<string, DatabaseRow>();
  for (const row of rows) {
    const key = authorKey(row.article_id, row.person_id);
    if (result.has(key)) throw new Error(`Article author table contains duplicate key ${key}`);
    result.set(key, row);
  }
  return result;
}

const RFC3339_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function canonicalScalar(value: unknown): unknown {
  if (typeof value !== 'string' || !RFC3339_TIMESTAMP.test(value)) return value;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

function same(left: unknown, right: unknown): boolean {
  return stableStringify(canonicalScalar(left)) === stableStringify(canonicalScalar(right));
}

function fieldChecksum(value: unknown): string {
  return checksumObject(value === undefined ? null : canonicalScalar(value));
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function plannedArticleMediaIds(row: DatabaseRow): Set<string> {
  const result = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    const node = value as Record<string, unknown>;
    if (typeof node.mediaId === 'string') result.add(node.mediaId);
    if (typeof node.posterMediaId === 'string') result.add(node.posterMediaId);
    for (const child of Object.values(node)) visit(child);
  };
  visit(row.content_json);
  for (const field of ['cover_url', 'social_image_url']) {
    if (typeof row[field] !== 'string') continue;
    try {
      const url = new URL(row[field]);
      const match = url.pathname.match(/\/media\/(med-[0-9a-f]{32})$/);
      if (match) result.add(match[1]!);
    } catch {
      // URL validation belongs to the plan; a malformed value cannot add a trusted media target.
    }
  }
  return result;
}

function importedFieldChecksums(value: unknown): Record<string, string> {
  const candidate = metadata(metadata(value).imported_field_checksums);
  return Object.fromEntries(
    Object.entries(candidate).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && /^[0-9a-f]{64}$/.test(entry[1]),
    ),
  );
}

function mergeImportedFieldChecksums(records: DatabaseRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  const conflicts = new Set<string>();
  for (const record of records) {
    for (const [field, checksum] of Object.entries(importedFieldChecksums(record.metadata))) {
      if (result[field] && result[field] !== checksum) conflicts.add(field);
      else result[field] = checksum;
    }
  }
  for (const field of conflicts) delete result[field];
  return result;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function targetMap(state: State, table: TargetTable): Map<string, DatabaseRow> {
  return state[table];
}

function addIssue(context: ReconcileContext, issue: ApplyIssue): void {
  context.report.issues.push(issue);
}

function queueInsert(
  context: ReconcileContext,
  table: string,
  row: DatabaseRow,
  stateMap?: Map<string, DatabaseRow>,
  stateKey?: string,
): void {
  context.mutations.push({ table, kind: 'insert', row });
  if (stateMap && stateKey) stateMap.set(stateKey, { ...row });
}

function queueUpdate(
  context: ReconcileContext,
  table: string,
  patch: DatabaseRow,
  filters: Readonly<Record<string, RestValue>>,
  existing: DatabaseRow,
): void {
  context.mutations.push({ table, kind: 'update', row: patch, filters });
  Object.assign(existing, patch);
}

function fieldOwner(
  rows: Map<string, DatabaseRow>,
  field: string,
  value: unknown,
  targetId: string,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  for (const [id, row] of rows) {
    if (id !== targetId && same(row[field], value)) return id;
  }
  return null;
}

function plannedLedgerRows(
  state: State,
  records: PlannedLegacyRecord[],
): Array<{ plan: PlannedLegacyRecord; existing: DatabaseRow | null }> {
  return records.map((plan) => ({
    plan,
    existing:
      state.records.get(recordKey(plan.source_id, plan.entity_type, plan.legacy_key)) ?? null,
  }));
}

function syncImportedLedger(
  context: ReconcileContext,
  record: PlannedLegacyRecord,
  existing: DatabaseRow | null,
  fieldChecksums: Record<string, string>,
): void {
  const desiredMetadata = {
    ...metadata(existing?.metadata),
    ...record.metadata,
    imported_field_checksums: fieldChecksums,
  };
  const desired: DatabaseRow = {
    ...record,
    metadata: desiredMetadata,
    imported_at: typeof existing?.imported_at === 'string' ? existing.imported_at : context.now,
  };
  if (!existing) {
    queueInsert(
      context,
      'legacy_import_records',
      desired,
      context.state.records,
      recordKey(record.source_id, record.entity_type, record.legacy_key),
    );
    context.report.legacyRecords.inserted += 1;
    return;
  }
  const fields = [
    'legacy_numeric_id',
    'legacy_slug',
    'legacy_url',
    'target_kind',
    'target_id',
    'source_checksum_sha256',
    'import_status',
    'metadata',
    'imported_at',
  ];
  const patch: DatabaseRow = {};
  for (const field of fields) {
    if (!same(existing[field], desired[field])) patch[field] = desired[field];
  }
  if (!Object.keys(patch).length) {
    context.report.legacyRecords.unchanged += 1;
    return;
  }
  patch.last_seen_at = context.now;
  queueUpdate(
    context,
    'legacy_import_records',
    patch,
    {
      source_id: record.source_id,
      entity_type: record.entity_type,
      legacy_key: record.legacy_key,
    },
    existing,
  );
  context.report.legacyRecords.updated += 1;
}

function matchingArticleProvenance(row: DatabaseRow, entity: PlannedEntity): boolean {
  return (
    row.legacy_source_id === entity.row.legacy_source_id &&
    row.legacy_post_id === entity.row.legacy_post_id
  );
}

function reconcileEntity(
  context: ReconcileContext,
  entity: PlannedEntity,
  options: Omit<EntityOptions, 'entities'>,
): void {
  if (options.kind === 'article') {
    const missingMedia = [...plannedArticleMediaIds(entity.row)].filter(
      (mediaId) => !context.acceptedTargets.media.has(mediaId),
    );
    if (missingMedia.length) {
      options.counter.conflicts += 1;
      addIssue(context, {
        level: 'error',
        code: 'article-media-target-missing',
        targetKind: options.kind,
        targetId: entity.id,
        message: 'One or more verified article media rows could not be reconciled.',
        fields: missingMedia.sort(),
      });
      return;
    }
  }
  const rows = targetMap(context.state, options.table);
  const ledger = plannedLedgerRows(context.state, entity.legacyRecords);
  const existingLedgers = ledger.flatMap(({ existing }) => (existing ? [existing] : []));
  const current = rows.get(entity.id) ?? null;
  const expectedTargetKind = options.kind;
  const conflictingLedger = existingLedgers.find(
    (record) =>
      record.import_status === 'imported' &&
      (record.target_id !== entity.id || record.target_kind !== expectedTargetKind),
  );
  if (conflictingLedger) {
    options.counter.conflicts += 1;
    addIssue(context, {
      level: 'error',
      code: 'legacy-target-conflict',
      targetKind: options.kind,
      targetId: entity.id,
      message: 'A legacy key is already mapped to a different target; no target data was changed.',
    });
    return;
  }

  if (!current) {
    const deletedAfterImport = existingLedgers.some(
      (record) => record.import_status === 'imported' && record.target_id === entity.id,
    );
    if (deletedAfterImport) {
      options.counter.skipped += 1;
      addIssue(context, {
        level: 'warning',
        code: 'studio-deletion-preserved',
        targetKind: options.kind,
        targetId: entity.id,
        message: 'The imported target no longer exists. It was not recreated.',
      });
      return;
    }
    const uniqueConflict = (options.uniqueFields ?? ['slug'])
      .map((field) => ({ field, owner: fieldOwner(rows, field, entity.row[field], entity.id) }))
      .find((entry) => entry.owner);
    if (uniqueConflict) {
      options.counter.conflicts += 1;
      addIssue(context, {
        level: 'error',
        code: 'unique-field-conflict',
        targetKind: options.kind,
        targetId: entity.id,
        message: `${uniqueConflict.field} is already owned by ${uniqueConflict.owner}; no target data was changed.`,
        fields: [uniqueConflict.field],
      });
      return;
    }
    const inserted = {
      ...entity.row,
      ...(options.table === 'articles' ? { legacy_imported_at: context.now } : {}),
    };
    queueInsert(context, options.table, inserted, rows, entity.id);
    context.acceptedTargets[options.kind].add(entity.id);
    options.counter.inserted += 1;
    const checksums = Object.fromEntries(
      Object.entries(entity.row)
        .filter(([field]) => field !== 'id')
        .map(([field, value]) => [field, fieldChecksum(value)]),
    );
    for (const item of ledger) {
      syncImportedLedger(context, item.plan, item.existing, checksums);
    }
    return;
  }

  const hasImportedLedger = existingLedgers.some(
    (record) => record.import_status === 'imported' && record.target_id === entity.id,
  );
  const isRecoverableArticle =
    options.table === 'articles' && matchingArticleProvenance(current, entity);
  if (!hasImportedLedger && !isRecoverableArticle) {
    options.counter.conflicts += 1;
    addIssue(context, {
      level: 'error',
      code: 'unowned-deterministic-id',
      targetKind: options.kind,
      targetId: entity.id,
      message: 'The deterministic target ID exists without matching import provenance.',
    });
    return;
  }
  context.acceptedTargets[options.kind].add(entity.id);

  const priorChecksums = mergeImportedFieldChecksums(existingLedgers);
  const nextChecksums = { ...priorChecksums };
  const patch: DatabaseRow = {};
  const preserved: string[] = [];
  for (const [field, incoming] of Object.entries(entity.row)) {
    if (field === 'id') continue;
    const currentValue = current[field];
    const managed = options.managedFields?.has(field) ?? false;
    const previousChecksum = priorChecksums[field];
    const currentMatchesPrevious =
      previousChecksum !== undefined && fieldChecksum(currentValue) === previousChecksum;
    const canWrite =
      managed ||
      same(currentValue, incoming) ||
      currentMatchesPrevious ||
      (!hasImportedLedger && isBlank(currentValue));
    const owner = (options.uniqueFields ?? ['slug']).includes(field)
      ? fieldOwner(rows, field, incoming, entity.id)
      : null;
    if (owner) {
      preserved.push(field);
      addIssue(context, {
        level: 'warning',
        code: 'updated-slug-conflict-preserved',
        targetKind: options.kind,
        targetId: entity.id,
        message: `The new source slug belongs to ${owner}; the current slug was preserved.`,
        fields: [field],
      });
      continue;
    }
    if (!canWrite) {
      preserved.push(field);
      continue;
    }
    nextChecksums[field] = fieldChecksum(incoming);
    if (!same(currentValue, incoming)) patch[field] = incoming;
  }
  if (preserved.length) {
    options.counter.preservedFields += preserved.length;
    addIssue(context, {
      level: 'info',
      code: 'studio-fields-preserved',
      targetKind: options.kind,
      targetId: entity.id,
      message: 'Fields changed outside the importer were preserved.',
      fields: [...new Set(preserved)].sort(),
    });
  }
  if (Object.keys(patch).length) {
    if (options.table === 'people') patch.updated_at = context.now;
    queueUpdate(context, options.table, patch, { id: entity.id }, current);
    options.counter.updated += 1;
  } else {
    options.counter.unchanged += 1;
  }
  for (const item of ledger) {
    syncImportedLedger(context, item.plan, item.existing, nextChecksums);
  }
}

function reconcileEntities(context: ReconcileContext, options: EntityOptions): void {
  for (const entity of options.entities) {
    reconcileEntity(context, entity, options);
  }
}

function reconcileSource(context: ReconcileContext, plan: WordPressApplyPlan): void {
  const current = context.state.sources.get(plan.source.id);
  if (!current) {
    queueInsert(
      context,
      'legacy_import_sources',
      plan.source,
      context.state.sources,
      plan.source.id,
    );
    context.report.source.inserted += 1;
    return;
  }
  if (
    current.source_kind !== plan.source.source_kind ||
    current.source_url !== plan.source.source_url
  ) {
    context.report.source.conflicts += 1;
    addIssue(context, {
      level: 'error',
      code: 'source-identity-conflict',
      targetKind: 'source',
      targetId: plan.source.id,
      message: 'The source ledger ID belongs to a different kind or URL.',
    });
    return;
  }
  const patch: DatabaseRow = {};
  for (const field of ['source_checksum_sha256', 'manifest_checksum_sha256']) {
    if (current[field] !== plan.source[field]) patch[field] = plan.source[field];
  }
  if (!Object.keys(patch).length) {
    context.report.source.unchanged += 1;
    return;
  }
  patch.last_seen_at = context.now;
  queueUpdate(context, 'legacy_import_sources', patch, { id: plan.source.id }, current);
  context.report.source.updated += 1;
}

function reconcileArticleAuthors(context: ReconcileContext, plan: WordPressApplyPlan): void {
  const expectedArticleIds = new Set(plan.articles.map((article) => article.id));
  for (const author of plan.articleAuthors) {
    const articleId = String(author.article_id);
    const personId = String(author.person_id);
    if (
      !context.acceptedTargets.article.has(articleId) ||
      !context.acceptedTargets.person.has(personId)
    ) {
      context.report.articleAuthors.skipped += 1;
      addIssue(context, {
        level: 'warning',
        code: 'article-author-target-missing',
        targetKind: 'article_author',
        targetId: articleId,
        message: 'The article or reconciled person is missing; the byline link was not created.',
      });
      continue;
    }
    const key = authorKey(articleId, personId);
    const current = context.state.articleAuthors.get(key);
    if (current) {
      if (
        current.position === author.position &&
        current.display_name_snapshot === author.display_name_snapshot
      ) {
        context.report.articleAuthors.unchanged += 1;
      } else {
        context.report.articleAuthors.skipped += 1;
        addIssue(context, {
          level: 'info',
          code: 'article-author-edit-preserved',
          targetKind: 'article_author',
          targetId: articleId,
          message: 'An existing article-author snapshot was preserved.',
        });
      }
      continue;
    }
    const sameArticle = [...context.state.articleAuthors.values()].filter(
      (row) => row.article_id === articleId,
    );
    if (sameArticle.length) {
      context.report.articleAuthors.conflicts += 1;
      addIssue(context, {
        level: 'warning',
        code: 'article-author-conflict-preserved',
        targetKind: 'article_author',
        targetId: articleId,
        message: 'The article already has a different author assignment; it was preserved.',
      });
      continue;
    }
    if (!expectedArticleIds.has(articleId)) {
      context.report.articleAuthors.skipped += 1;
      continue;
    }
    queueInsert(context, 'article_authors', author, context.state.articleAuthors, key);
    context.report.articleAuthors.inserted += 1;
  }
}

function reconcilePendingRecords(
  context: ReconcileContext,
  records: PlannedLegacyRecord[],
  recordCounter: MutationCounter,
): void {
  for (const record of records) {
    const key = recordKey(record.source_id, record.entity_type, record.legacy_key);
    const current = context.state.records.get(key);
    if (!current) {
      queueInsert(context, 'legacy_import_records', record, context.state.records, key);
      recordCounter.inserted += 1;
      context.report.legacyRecords.inserted += 1;
      continue;
    }
    if (
      current.import_status !== 'pending' ||
      current.target_id !== null ||
      current.target_kind !== record.target_kind
    ) {
      recordCounter.skipped += 1;
      context.report.legacyRecords.skipped += 1;
      addIssue(context, {
        level: 'info',
        code: 'resolved-pending-record-preserved',
        targetKind: String(record.target_kind),
        targetId: typeof current.target_id === 'string' ? current.target_id : null,
        message: 'A page or media ledger was resolved after planning and was not reset.',
      });
      continue;
    }
    const patch: DatabaseRow = {};
    for (const field of [
      'legacy_numeric_id',
      'legacy_slug',
      'legacy_url',
      'source_checksum_sha256',
      'metadata',
    ]) {
      if (!same(current[field], record[field])) patch[field] = record[field];
    }
    if (!Object.keys(patch).length) {
      recordCounter.unchanged += 1;
      context.report.legacyRecords.unchanged += 1;
      continue;
    }
    patch.last_seen_at = context.now;
    queueUpdate(
      context,
      'legacy_import_records',
      patch,
      {
        source_id: record.source_id,
        entity_type: record.entity_type,
        legacy_key: record.legacy_key,
      },
      current,
    );
    recordCounter.updated += 1;
    context.report.legacyRecords.updated += 1;
  }
}

function reconcileRedirects(context: ReconcileContext, plan: WordPressApplyPlan): void {
  for (const redirect of plan.redirects) {
    const sourcePath = String(redirect.source_path);
    const current = context.state.redirects.get(sourcePath);
    if (!current) {
      queueInsert(context, 'url_redirects', redirect, context.state.redirects, sourcePath);
      context.report.redirects.inserted += 1;
      continue;
    }
    if (
      current.destination === redirect.destination &&
      current.status_code === redirect.status_code &&
      current.is_active === true
    ) {
      context.report.redirects.unchanged += 1;
      continue;
    }
    context.report.redirects.conflicts += 1;
    context.report.redirects.skipped += 1;
    addIssue(context, {
      level: 'warning',
      code: 'existing-redirect-preserved',
      targetKind: 'redirect',
      targetId: sourcePath,
      message: 'A pre-existing redirect differs from the import plan and was preserved.',
    });
  }
}

async function loadState(database: RestDatabase, sourceId: string): Promise<State> {
  const [sources, records, people, mediaAssets, articles, articleAuthors, books, redirects] =
    await Promise.all([
      database.select('legacy_import_sources', '*', { id: sourceId }),
      database.select('legacy_import_records', '*', { source_id: sourceId }),
      database.select('people'),
      database.select('article_media_assets'),
      database.select('articles'),
      database.select('article_authors'),
      database.select('books'),
      database.select('url_redirects'),
    ]);
  return {
    sources: mapRows(sources, 'id', 'Source ledger'),
    records: mapRecords(records),
    people: mapRows(people, 'id', 'People'),
    article_media_assets: mapRows(mediaAssets, 'id', 'Media assets'),
    articles: mapRows(articles, 'id', 'Articles'),
    articleAuthors: mapArticleAuthors(articleAuthors),
    books: mapRows(books, 'id', 'Books'),
    redirects: mapRows(redirects, 'source_path', 'Redirects'),
  };
}

function countUntouched(rows: Map<string, DatabaseRow>, plannedIds: Set<string>): number {
  return [...rows.keys()].filter((id) => !plannedIds.has(id)).length;
}

function createReport(plan: WordPressApplyPlan, now: string, apply: boolean): WordPressApplyReport {
  const importedRecordCount =
    plan.people.reduce((total, entity) => total + entity.legacyRecords.length, 0) +
    plan.mediaAssets.reduce((total, entity) => total + entity.legacyRecords.length, 0) +
    plan.articles.reduce((total, entity) => total + entity.legacyRecords.length, 0) +
    plan.books.reduce((total, entity) => total + entity.legacyRecords.length, 0);
  return {
    schemaVersion: 1,
    generatedAt: now,
    mode: apply ? 'apply' : 'database-dry-run',
    applied: false,
    blocked: false,
    planChecksumSha256: plan.checksumSha256,
    manifestChecksumSha256: plan.source.manifest_checksum_sha256,
    source: counter(1),
    people: counter(plan.people.length),
    mediaAssets: counter(plan.mediaAssets.length),
    articles: counter(plan.articles.length),
    blockedArticles: counter(plan.blockedArticles.length),
    articleAuthors: counter(plan.articleAuthors.length),
    books: counter(plan.books.length),
    pendingPages: counter(plan.pendingPages.length),
    pendingMedia: counter(plan.pendingMedia.length),
    legacyRecords: counter(
      importedRecordCount +
        plan.blockedArticles.length +
        plan.pendingPages.length +
        plan.pendingMedia.length,
    ),
    redirects: counter(plan.redirects.length),
    untouchedExistingRows: { people: 0, mediaAssets: 0, articles: 0, books: 0 },
    excludedRedirects: plan.excludedRedirects.length,
    articleDependencies: plan.articleDependencies,
    plannedMutations: 0,
    issues: [],
  };
}

async function executeMutations(database: RestDatabase, mutations: Mutation[]): Promise<void> {
  for (const table of TABLE_ORDER) {
    const inserts = mutations.filter(
      (mutation) => mutation.table === table && mutation.kind === 'insert',
    );
    if (inserts.length)
      await database.insert(
        table,
        inserts.map((mutation) => mutation.row),
      );
    for (const mutation of mutations) {
      if (mutation.table !== table || mutation.kind !== 'update') continue;
      if (!mutation.filters) throw new Error(`Update mutation for ${table} has no filters`);
      await database.update(table, mutation.row, mutation.filters);
    }
  }
}

export async function executeWordPressApplyPlan(options: {
  plan: WordPressApplyPlan;
  database: RestDatabase;
  apply: boolean;
  now?: () => string;
}): Promise<WordPressApplyReport> {
  if (options.plan.errors.length) {
    throw new Error(`Import plan contains ${options.plan.errors.length} error(s)`);
  }
  const now = options.now?.() ?? new Date().toISOString();
  const state = await loadState(options.database, options.plan.source.id);
  const report = createReport(options.plan, now, options.apply);
  report.untouchedExistingRows = {
    people: countUntouched(state.people, new Set(options.plan.people.map((entity) => entity.id))),
    mediaAssets: countUntouched(
      state.article_media_assets,
      new Set(options.plan.mediaAssets.map((entity) => entity.id)),
    ),
    articles: countUntouched(
      state.articles,
      new Set(options.plan.articles.map((entity) => entity.id)),
    ),
    books: countUntouched(state.books, new Set(options.plan.books.map((entity) => entity.id))),
  };
  const context: ReconcileContext = {
    state,
    mutations: [],
    report,
    now,
    acceptedTargets: {
      person: new Set<string>(),
      media: new Set<string>(),
      article: new Set<string>(),
      book: new Set<string>(),
    },
  };
  reconcileSource(context, options.plan);
  reconcileEntities(context, {
    table: 'article_media_assets',
    kind: 'media',
    counter: report.mediaAssets,
    entities: options.plan.mediaAssets,
    uniqueFields: ['storage_key'],
  });
  reconcileEntities(context, {
    table: 'people',
    kind: 'person',
    counter: report.people,
    entities: options.plan.people,
  });
  reconcileEntities(context, {
    table: 'articles',
    kind: 'article',
    counter: report.articles,
    entities: options.plan.articles,
    managedFields: ARTICLE_PROVENANCE_FIELDS,
  });
  reconcileEntities(context, {
    table: 'books',
    kind: 'book',
    counter: report.books,
    entities: options.plan.books,
  });
  reconcileArticleAuthors(context, options.plan);
  reconcilePendingRecords(context, options.plan.blockedArticles, report.blockedArticles);
  reconcilePendingRecords(context, options.plan.pendingPages, report.pendingPages);
  reconcilePendingRecords(context, options.plan.pendingMedia, report.pendingMedia);
  reconcileRedirects(context, options.plan);
  report.plannedMutations = context.mutations.length;
  report.blocked = report.issues.some((issue) => issue.level === 'error');
  if (options.apply && !report.blocked) {
    await executeMutations(options.database, context.mutations);
    report.applied = true;
  }
  return report;
}
