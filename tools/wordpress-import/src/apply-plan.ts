import path from 'node:path';
import { checksumObject, omitChecksum } from './hash.ts';
import { convertWordPressContent, sanitizedPlainText } from './content.ts';
import {
  analyzeArticleDependencies,
  type ArticleDependencyReport,
} from './article-dependencies.ts';
import {
  mediaPublicUrl,
  wordpressExternalMediaAssetId,
  wordpressMediaAssetId,
  type VerifiedExternalR2MediaStorage,
  type VerifiedR2MediaStorage,
} from './r2-media.ts';
import { rewriteArticleLink } from './legacy-links.ts';
import type {
  ProposedRedirect,
  WordPressAuthor,
  WordPressManifest,
  WordPressRecord,
} from './types.ts';

export const WORDPRESS_SOURCE_ID = 'wordpress:mukhtalif.net';

export type DatabaseRow = Record<string, unknown>;

export interface PlannedEntity {
  id: string;
  row: DatabaseRow;
  legacyRecords: PlannedLegacyRecord[];
  sourceChecksumSha256: string;
}

export interface PlannedLegacyRecord extends DatabaseRow {
  source_id: string;
  entity_type: string;
  legacy_key: string;
  legacy_numeric_id: number | null;
  legacy_slug: string | null;
  legacy_url: string | null;
  target_kind: string | null;
  target_id: string | null;
  source_checksum_sha256: string;
  import_status: 'pending' | 'imported' | 'skipped' | 'failed';
  metadata: Record<string, unknown>;
  imported_at: string | null;
}

export interface PlannedArticleAuthor extends DatabaseRow {
  article_id: string;
  person_id: string;
  position: number;
  display_name_snapshot: string;
}

export interface ExcludedRedirect {
  sourcePath: string;
  reason: 'collision' | 'disabled' | 'requires-review';
  candidates: Array<{
    destination: string;
    statusCode: number;
    source: string;
    legacyRecordId: number | null;
  }>;
}

export interface ExternalInlineMediaDependency {
  sourceUrl: string;
  proposedMediaId: string;
  mediaId: string | null;
  storageKey: string | null;
  r2Verified: boolean;
  assetEligible: boolean;
  assetBlockers: string[];
  occurrences: Array<{ legacyPostId: number; order: number }>;
}

export interface WordPressApplyPlan {
  schemaVersion: 2;
  source: DatabaseRow & {
    id: string;
    source_kind: 'wordpress_wxr';
    source_url: string;
    source_checksum_sha256: string;
    manifest_checksum_sha256: string;
  };
  mediaStorage: Omit<VerifiedR2MediaStorage, 'items'> & {
    itemCount: number;
    externalR2VerificationReportChecksumSha256: string;
    externalItemCount: number;
  };
  people: PlannedEntity[];
  mediaAssets: PlannedEntity[];
  articles: PlannedEntity[];
  blockedArticles: PlannedLegacyRecord[];
  articleDependencies: ArticleDependencyReport[];
  articleAuthors: PlannedArticleAuthor[];
  books: PlannedEntity[];
  pendingPages: PlannedLegacyRecord[];
  pendingMedia: PlannedLegacyRecord[];
  externalInlineMedia: ExternalInlineMediaDependency[];
  redirects: DatabaseRow[];
  excludedRedirects: ExcludedRedirect[];
  warnings: string[];
  errors: string[];
  checksumSha256: string;
}

interface Identity {
  key: string;
  kind: 'author' | 'team_member';
  legacyId: number;
  name: string;
  normalizedName: string;
  email: string | null;
  author: WordPressAuthor | null;
  team: WordPressRecord | null;
}

class DisjointSet {
  readonly #parent = new Map<string, string>();

  add(value: string): void {
    if (!this.#parent.has(value)) this.#parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.#parent.get(value);
    if (!parent) throw new Error(`Unknown identity ${value}`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.#parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    this.#parent.set(second, first);
  }
}

function normalizedPersonName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function truncate(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return [...normalized].slice(0, maximum).join('');
}

interface MediaResolution {
  legacyId: number | null;
  mediaId: string | null;
  publicUrl: string | null;
  storageKey: string | null;
  eligible: boolean;
  blockers: string[];
  defaultAlt: string | null;
}

interface MediaPlanResult {
  mediaAssets: PlannedEntity[];
  pendingMedia: PlannedLegacyRecord[];
  resolutions: Map<number, MediaResolution>;
  externalResolutions: Map<string, MediaResolution>;
}

function resolvedMediaUrl(
  resolutions: Map<number, MediaResolution>,
  legacyId: number | null,
): string | null {
  return legacyId ? (resolutions.get(legacyId)?.publicUrl ?? null) : null;
}

function importedRecord(options: {
  entityType: string;
  legacyId: number;
  slug?: string | null;
  legacyUrl?: string | null;
  targetKind: string;
  targetId: string;
  sourceChecksumSha256: string;
  metadata?: Record<string, unknown>;
}): PlannedLegacyRecord {
  return {
    source_id: WORDPRESS_SOURCE_ID,
    entity_type: options.entityType,
    legacy_key: String(options.legacyId),
    legacy_numeric_id: options.legacyId,
    legacy_slug: options.slug ?? null,
    legacy_url: options.legacyUrl ?? null,
    target_kind: options.targetKind,
    target_id: options.targetId,
    source_checksum_sha256: options.sourceChecksumSha256,
    import_status: 'imported',
    metadata: options.metadata ?? {},
    imported_at: null,
  };
}

function pendingRecord(options: {
  entityType: 'page' | 'attachment';
  record: WordPressRecord;
  targetKind: 'page' | 'media';
  metadata: Record<string, unknown>;
}): PlannedLegacyRecord {
  return {
    source_id: WORDPRESS_SOURCE_ID,
    entity_type: options.entityType,
    legacy_key: String(options.record.legacyId),
    legacy_numeric_id: options.record.legacyId,
    legacy_slug: options.record.slug || null,
    legacy_url: options.record.legacyUrl,
    target_kind: options.targetKind,
    target_id: null,
    source_checksum_sha256: options.record.checksumSha256,
    import_status: 'pending',
    metadata: options.metadata,
    imported_at: null,
  };
}

function mediaPlan(
  manifest: WordPressManifest,
  storage: VerifiedR2MediaStorage,
  externalStorage: VerifiedExternalR2MediaStorage,
): MediaPlanResult {
  if (externalStorage.bucket !== storage.bucket) {
    throw new Error('WordPress and external media verification reports use different R2 buckets');
  }
  const storageItems = new Map(storage.items.map((item) => [item.legacyId, item]));
  const mediaAssets: PlannedEntity[] = [];
  const pendingMedia: PlannedLegacyRecord[] = [];
  const resolutions = new Map<number, MediaResolution>();
  const externalResolutions = new Map<string, MediaResolution>();
  for (const record of manifest.candidates.attachment) {
    const item = storageItems.get(record.legacyId) ?? null;
    const blockers: string[] = [];
    if (!item) blockers.push('missing-r2-verification');
    const mimeType = item?.mimeType ?? record.media?.mimeType ?? null;
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      blockers.push(`unsupported-mime:${mimeType ?? 'unknown'}`);
    }
    const byteSize = item?.byteSize ?? null;
    if (!byteSize || byteSize > 10_485_760) blockers.push('invalid-or-oversize-bytes');
    const width = item?.width ?? null;
    const height = item?.height ?? null;
    if (!width || !height || width > 8_192 || height > 8_192 || width * height > 24_000_000) {
      blockers.push('invalid-or-oversize-dimensions');
    }
    const fileName = item ? path.posix.basename(item.key) : '';
    if (![...fileName].length || [...fileName].length > 160) {
      blockers.push('invalid-file-name');
    }
    const attachedName = record.media?.attachedFile
      ? path.posix.basename(record.media.attachedFile)
      : '';
    const defaultAlt =
      record.media?.altText?.trim() || record.title.trim() || attachedName.trim() || null;
    if (!defaultAlt || [...defaultAlt].length > 500) blockers.push('missing-or-oversize-alt');
    const caption = sanitizedPlainText(record.media?.captionHtml ?? '');
    if ([...caption].length > 1_000) blockers.push('oversize-caption');
    const uniqueBlockers = [...new Set(blockers)].sort();
    const eligible = uniqueBlockers.length === 0;
    const mediaId = eligible ? wordpressMediaAssetId(record.legacyId) : null;
    const publicUrl = eligible ? mediaPublicUrl(storage, record.legacyId) : null;
    resolutions.set(record.legacyId, {
      legacyId: record.legacyId,
      mediaId,
      publicUrl,
      storageKey: item?.key ?? null,
      eligible,
      blockers: uniqueBlockers,
      defaultAlt,
    });
    const storageMetadata = {
      source_url: record.media?.sourceUrl,
      attached_file: record.media?.attachedFile,
      mime_type: mimeType,
      alt_text: record.media?.altText,
      width,
      height,
      byte_size: byteSize,
      storage_key: item?.key ?? null,
      storage_checksum_sha256: item?.checksumSha256 ?? null,
      storage_verification_report_checksum_sha256: storage.r2VerificationReportChecksumSha256,
      storage_status: item ? 'verified' : 'missing',
      asset_blockers: uniqueBlockers,
    };
    if (!eligible || !item || !mediaId || !defaultAlt || !width || !height || !byteSize) {
      pendingMedia.push(
        pendingRecord({
          entityType: 'attachment',
          record,
          targetKind: 'media',
          metadata: storageMetadata,
        }),
      );
      continue;
    }
    const row: DatabaseRow = {
      id: mediaId,
      kind: 'image',
      mime_type: mimeType,
      original_file_name: fileName,
      storage_key: item.key,
      byte_size: byteSize,
      expected_byte_size: byteSize,
      width,
      height,
      default_alt: defaultAlt,
      default_caption: caption || null,
      status: 'ready',
      upload_started_at: null,
      upload_token: null,
    };
    mediaAssets.push({
      id: mediaId,
      row,
      sourceChecksumSha256: checksumObject({
        source: record.checksumSha256,
        object: item.checksumSha256,
      }),
      legacyRecords: [
        importedRecord({
          entityType: 'attachment',
          legacyId: record.legacyId,
          slug: record.slug,
          legacyUrl: record.legacyUrl,
          targetKind: 'media',
          targetId: mediaId,
          sourceChecksumSha256: record.checksumSha256,
          metadata: storageMetadata,
        }),
      ],
    });
  }
  for (const item of externalStorage.items) {
    const blockers: string[] = [];
    if (item.mimeType !== 'image/jpeg' && item.mimeType !== 'image/png') {
      blockers.push(`unsupported-mime:${item.mimeType}`);
    }
    if (!item.byteSize || item.byteSize > 10_485_760) blockers.push('invalid-or-oversize-bytes');
    if (
      !item.width ||
      !item.height ||
      item.width > 8_192 ||
      item.height > 8_192 ||
      item.width * item.height > 24_000_000
    ) {
      blockers.push('invalid-or-oversize-dimensions');
    }
    const fileName = path.posix.basename(item.key);
    if (![...fileName].length || [...fileName].length > 160) blockers.push('invalid-file-name');
    const defaultAlt = fileName || null;
    if (!defaultAlt || [...defaultAlt].length > 500) blockers.push('missing-or-oversize-alt');
    const uniqueBlockers = [...new Set(blockers)].sort();
    const eligible = uniqueBlockers.length === 0;
    const mediaId = eligible ? wordpressExternalMediaAssetId(item.sourceUrl) : null;
    const publicUrl = mediaId ? `${storage.mediaPublicOrigin}/media/${mediaId}` : null;
    externalResolutions.set(item.sourceUrl, {
      legacyId: null,
      mediaId,
      publicUrl,
      storageKey: item.key,
      eligible,
      blockers: uniqueBlockers,
      defaultAlt,
    });
    const sourceChecksumSha256 = checksumObject({
      sourceUrl: item.sourceUrl,
      objectChecksumSha256: item.checksumSha256,
    });
    const metadata = {
      external_source_url: item.sourceUrl,
      url_sha256: item.urlSha256,
      mime_type: item.mimeType,
      width: item.width,
      height: item.height,
      byte_size: item.byteSize,
      storage_key: item.key,
      storage_checksum_sha256: item.checksumSha256,
      storage_verification_report_checksum_sha256:
        externalStorage.r2VerificationReportChecksumSha256,
      storage_status: 'verified',
      asset_blockers: uniqueBlockers,
    };
    const legacyRecord: PlannedLegacyRecord = {
      source_id: WORDPRESS_SOURCE_ID,
      entity_type: 'attachment',
      legacy_key: `external:${item.urlSha256}`,
      legacy_numeric_id: null,
      legacy_slug: null,
      legacy_url: item.sourceUrl,
      target_kind: 'media',
      target_id: eligible ? mediaId : null,
      source_checksum_sha256: sourceChecksumSha256,
      import_status: eligible ? 'imported' : 'pending',
      metadata,
      imported_at: null,
    };
    if (!eligible || !mediaId || !defaultAlt) {
      pendingMedia.push(legacyRecord);
      continue;
    }
    const row: DatabaseRow = {
      id: mediaId,
      kind: 'image',
      mime_type: item.mimeType,
      original_file_name: fileName,
      storage_key: item.key,
      byte_size: item.byteSize,
      expected_byte_size: item.byteSize,
      width: item.width,
      height: item.height,
      default_alt: defaultAlt,
      default_caption: null,
      status: 'ready',
      upload_started_at: null,
      upload_token: null,
    };
    mediaAssets.push({
      id: mediaId,
      row,
      sourceChecksumSha256,
      legacyRecords: [legacyRecord],
    });
  }
  mediaAssets.sort((left, right) => left.id.localeCompare(right.id));
  pendingMedia.sort(
    (left, right) => (left.legacy_numeric_id ?? 0) - (right.legacy_numeric_id ?? 0),
  );
  return { mediaAssets, pendingMedia, resolutions, externalResolutions };
}

function identityPlan(
  manifest: WordPressManifest,
  warnings: string[],
  mediaResolutions: Map<number, MediaResolution>,
): {
  people: PlannedEntity[];
  authorTargets: Map<number, string>;
  teamTargets: Map<number, string>;
} {
  const identities: Identity[] = [
    ...manifest.authors.map((author) => ({
      key: `author:${author.legacyId}`,
      kind: 'author' as const,
      legacyId: author.legacyId,
      name: author.displayName.trim(),
      normalizedName: normalizedPersonName(author.displayName),
      email: author.email.trim().toLowerCase() || null,
      author,
      team: null,
    })),
    ...manifest.candidates.team_member.map((team) => {
      const name = (team.teamMember?.name ?? team.title).trim();
      return {
        key: `team_member:${team.legacyId}`,
        kind: 'team_member' as const,
        legacyId: team.legacyId,
        name,
        normalizedName: normalizedPersonName(name),
        email: null,
        author: null,
        team,
      };
    }),
  ];
  const set = new DisjointSet();
  for (const identity of identities) set.add(identity.key);
  const byName = new Map<string, Identity>();
  const byEmail = new Map<string, Identity>();
  for (const identity of identities) {
    if (identity.normalizedName) {
      const match = byName.get(identity.normalizedName);
      if (match) set.union(identity.key, match.key);
      else byName.set(identity.normalizedName, identity);
    }
    if (identity.email) {
      const match = byEmail.get(identity.email);
      if (match) set.union(identity.key, match.key);
      else byEmail.set(identity.email, identity);
    }
  }
  const groups = new Map<string, Identity[]>();
  for (const identity of identities) {
    const root = set.find(identity.key);
    groups.set(root, [...(groups.get(root) ?? []), identity]);
  }
  const people: PlannedEntity[] = [];
  const authorTargets = new Map<number, string>();
  const teamTargets = new Map<number, string>();
  for (const members of groups.values()) {
    members.sort(
      (left, right) =>
        (left.kind === 'author' ? 0 : 1) - (right.kind === 'author' ? 0 : 1) ||
        left.legacyId - right.legacyId,
    );
    const canonical = members[0];
    const personId = `per-wp-${canonical.kind === 'author' ? 'author' : 'team'}-${canonical.legacyId}`;
    const teams = members.filter((member) => member.team).map((member) => member.team!);
    const authors = members.filter((member) => member.author).map((member) => member.author!);
    const displayName =
      teams.map((team) => team.teamMember?.name?.trim()).find(Boolean) ??
      authors.map((author) => author.displayName.trim()).find(Boolean) ??
      canonical.name;
    const aliases = [...new Set(members.map((member) => member.name).filter(Boolean))];
    if (aliases.length > 1) {
      warnings.push(`Person ${personId} reconciles aliases: ${aliases.join(' | ')}`);
    }
    const roleTitles = [
      ...new Set(teams.map((team) => team.teamMember?.position?.trim()).filter(Boolean)),
    ];
    if (roleTitles.length > 1) {
      warnings.push(`Person ${personId} has conflicting team roles: ${roleTitles.join(' | ')}`);
    }
    const imageUrls = [
      ...new Set(
        teams
          .map((team) => resolvedMediaUrl(mediaResolutions, team.teamMember?.imageLegacyId ?? null))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (imageUrls.length > 1) warnings.push(`Person ${personId} has multiple source images`);
    const socialLinks: Record<string, string> = {};
    for (const team of teams) {
      for (const [platform, value] of Object.entries(team.teamMember?.socials ?? {})) {
        const url = safeHttpUrl(value);
        if (url && !socialLinks[platform]) socialLinks[platform] = url;
      }
    }
    const bios = teams
      .map((team) => convertWordPressContent(team.contentHtml).legacyContentHtml)
      .filter(Boolean);
    const row: DatabaseRow = {
      id: personId,
      slug: `wp-${canonical.kind === 'author' ? 'author' : 'team'}-${canonical.legacyId}`,
      display_name: truncate(displayName, 160),
      first_name: truncate(authors[0]?.firstName, 100),
      last_name: truncate(authors[0]?.lastName, 100),
      role_title: truncate(roleTitles[0], 160),
      bio_html: bios[0] ?? '',
      image_url: imageUrls[0] ?? null,
      social_links: socialLinks,
      visibility: 'public',
    };
    const legacyRecords = members.map((member) => {
      if (member.author) {
        authorTargets.set(member.author.legacyId, personId);
        return importedRecord({
          entityType: 'author',
          legacyId: member.author.legacyId,
          targetKind: 'person',
          targetId: personId,
          sourceChecksumSha256: member.author.checksumSha256,
          metadata: { aliases, reconciled_identity_count: members.length },
        });
      }
      const team = member.team!;
      teamTargets.set(team.legacyId, personId);
      return importedRecord({
        entityType: 'team_member',
        legacyId: team.legacyId,
        slug: team.slug,
        legacyUrl: team.legacyUrl,
        targetKind: 'person',
        targetId: personId,
        sourceChecksumSha256: team.checksumSha256,
        metadata: { aliases, reconciled_identity_count: members.length },
      });
    });
    people.push({
      id: personId,
      row,
      legacyRecords,
      sourceChecksumSha256: checksumObject(members.map((member) => member.key)),
    });
  }
  people.sort((left, right) => left.id.localeCompare(right.id));
  return { people, authorTargets, teamTargets };
}

function authorByLogin(manifest: WordPressManifest): Map<string, WordPressAuthor> {
  return new Map(manifest.authors.map((author) => [author.login, author]));
}

function resolveArticleDependencies(
  report: ArticleDependencyReport,
  resolutions: Map<number, MediaResolution>,
  externalResolutions: Map<string, MediaResolution>,
): ArticleDependencyReport {
  const featuredResolution = report.featuredMedia.legacyId
    ? (resolutions.get(report.featuredMedia.legacyId) ?? null)
    : null;
  const inlineMedia = report.inlineMedia.map((dependency) => {
    const resolution = dependency.attachmentLegacyId
      ? (resolutions.get(dependency.attachmentLegacyId) ?? null)
      : dependency.url
        ? (externalResolutions.get(dependency.url) ?? null)
        : null;
    const resolvedAlt = dependency.alt.trim() || resolution?.defaultAlt || '';
    const assetBlockers = [
      ...(resolution?.blockers ?? ['external-inline-media-not-imported']),
      ...(!resolvedAlt ? ['missing-inline-media-alt'] : []),
      ...([...resolvedAlt].length > 500 ? ['oversize-inline-media-alt'] : []),
    ];
    return {
      ...dependency,
      mapping:
        !dependency.attachmentLegacyId && resolution
          ? ('external-r2' as const)
          : dependency.mapping,
      alt: resolvedAlt,
      mediaId: resolution?.mediaId ?? null,
      r2StorageKey: resolution?.storageKey ?? null,
      r2Verified: Boolean(resolution?.storageKey),
      assetEligible: Boolean(resolution?.eligible && assetBlockers.length === 0),
      assetBlockers: [...new Set(assetBlockers)].sort(),
    };
  });
  const blockers = report.blockers.filter((blocker) => blocker !== 'unresolved-inline-media');
  if (!featuredResolution?.eligible || !featuredResolution.mediaId) {
    blockers.push('featured-media-not-ready-in-r2');
  }
  if (inlineMedia.some((dependency) => !dependency.assetEligible || !dependency.mediaId)) {
    blockers.push('inline-media-not-ready-in-r2');
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    ...report,
    featuredMedia: {
      ...report.featuredMedia,
      mediaId: featuredResolution?.mediaId ?? null,
      publicUrl: featuredResolution?.publicUrl ?? null,
      r2StorageKey: featuredResolution?.storageKey ?? null,
      r2Verified: Boolean(featuredResolution?.storageKey),
      assetEligible: featuredResolution?.eligible ?? false,
      assetBlockers: featuredResolution?.blockers ?? ['missing-r2-verification'],
    },
    inlineMedia,
    blockers: uniqueBlockers,
    readyForApply: uniqueBlockers.length === 0,
  };
}

function externalInlineMedia(
  dependencies: ArticleDependencyReport[],
): ExternalInlineMediaDependency[] {
  const result = new Map<string, ExternalInlineMediaDependency>();
  for (const article of dependencies) {
    for (const image of article.inlineMedia) {
      if (image.attachmentLegacyId || !image.url) continue;
      const existing = result.get(image.url) ?? {
        sourceUrl: image.url,
        proposedMediaId: wordpressExternalMediaAssetId(image.url),
        mediaId: image.mediaId,
        storageKey: image.r2StorageKey,
        r2Verified: image.r2Verified,
        assetEligible: image.assetEligible,
        assetBlockers: image.assetBlockers,
        occurrences: [],
      };
      existing.occurrences.push({ legacyPostId: article.legacyPostId, order: image.order });
      result.set(image.url, existing);
    }
  }
  return [...result.values()]
    .map((entry) => ({
      ...entry,
      occurrences: entry.occurrences.sort(
        (left, right) => left.legacyPostId - right.legacyPostId || left.order - right.order,
      ),
    }))
    .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
}

function articlePlan(
  manifest: WordPressManifest,
  authorTargets: Map<number, string>,
  mediaResolutions: Map<number, MediaResolution>,
  externalMediaResolutions: Map<string, MediaResolution>,
  warnings: string[],
  errors: string[],
): {
  articles: PlannedEntity[];
  blockedArticles: PlannedLegacyRecord[];
  articleDependencies: ArticleDependencyReport[];
  articleAuthors: PlannedArticleAuthor[];
} {
  const authors = authorByLogin(manifest);
  const articles: PlannedEntity[] = [];
  const blockedArticles: PlannedLegacyRecord[] = [];
  const articleDependencies: ArticleDependencyReport[] = [];
  const articleAuthors: PlannedArticleAuthor[] = [];
  for (const post of manifest.candidates.post) {
    try {
      const author = post.authorLogin ? authors.get(post.authorLogin) : null;
      if (!author) throw new Error(`missing WXR author ${post.authorLogin ?? '(blank)'}`);
      const personId = authorTargets.get(author.legacyId);
      if (!personId) throw new Error(`author ${author.legacyId} has no person target`);
      let dependencies = resolveArticleDependencies(
        analyzeArticleDependencies({
          post,
          attachments: manifest.candidates.attachment,
        }),
        mediaResolutions,
        externalMediaResolutions,
      );
      let conversion = null;
      if (dependencies.readyForApply) {
        try {
          conversion = convertWordPressContent(post.contentHtml, {
            images: dependencies.inlineMedia.map((dependency) => ({
              mediaId: dependency.mediaId!,
              alt: dependency.alt,
              ...(dependency.linkUrl ? { linkUrl: dependency.linkUrl } : {}),
            })),
            rewriteLink: rewriteArticleLink,
            videoPosterMediaId: dependencies.featuredMedia.mediaId ?? undefined,
            defaultVideoTitle: post.title,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Post ${post.legacyId} content conversion is pending: ${message}`);
          dependencies = {
            ...dependencies,
            blockers: [...new Set([...dependencies.blockers, 'content-conversion-failed'])].sort(),
            readyForApply: false,
          };
        }
      }
      if (
        conversion &&
        (conversion.stats.externalImages ||
          conversion.stats.mappedImages !== dependencies.inlineMedia.length ||
          conversion.stats.droppedElements ||
          conversion.stats.droppedUnsafeUrls)
      ) {
        dependencies = {
          ...dependencies,
          blockers: [...dependencies.blockers, 'content-conversion-is-not-lossless'].sort(),
          readyForApply: false,
        };
        conversion = null;
      }
      articleDependencies.push(dependencies);
      if (!dependencies.readyForApply) {
        blockedArticles.push({
          source_id: WORDPRESS_SOURCE_ID,
          entity_type: 'post',
          legacy_key: String(post.legacyId),
          legacy_numeric_id: post.legacyId,
          legacy_slug: post.slug || null,
          legacy_url: post.legacyUrl,
          target_kind: 'article',
          target_id: null,
          source_checksum_sha256: post.checksumSha256,
          import_status: 'pending',
          metadata: {
            title: post.title,
            suggested_target_slug: post.suggestedTargetSlug,
            blocked_reason: 'content-fidelity-gate',
            dependencies,
          },
          imported_at: null,
        });
        continue;
      }
      if (!conversion) throw new Error('content conversion did not produce a document');
      const featured = post.featuredMediaLegacyId
        ? (manifest.candidates.attachment.find(
            (record) => record.legacyId === post.featuredMediaLegacyId,
          ) ?? null)
        : null;
      const coverUrl = dependencies.featuredMedia.publicUrl;
      const excerpt = truncate(sanitizedPlainText(post.excerptHtml), 500);
      const seoDescription = truncate(post.seo.description, 170);
      if (post.seo.description && seoDescription !== post.seo.description.trim()) {
        warnings.push(`Post ${post.legacyId} SEO description was limited to 170 characters`);
      }
      const articleId = `art-wp-${post.legacyId}`;
      const row: DatabaseRow = {
        id: articleId,
        slug: post.suggestedTargetSlug,
        title_ar: post.title.trim(),
        title_en: null,
        body_ar: conversion.plainText,
        excerpt_ar: excerpt,
        cover_url: coverUrl,
        cover_alt: coverUrl ? (truncate(featured?.media?.altText, 240) ?? post.title.trim()) : null,
        content_json: conversion.document,
        content_html: conversion.contentHtml,
        seo_title: truncate(post.seo.title, 70),
        seo_description: seoDescription,
        canonical_url: safeHttpUrl(post.seo.canonicalUrl),
        social_title: truncate(post.seo.openGraph.title ?? post.seo.twitter.title, 100),
        social_description: truncate(
          post.seo.openGraph.description ?? post.seo.twitter.description,
          200,
        ),
        social_image_url:
          resolvedMediaUrl(
            mediaResolutions,
            post.seo.openGraph.imageLegacyId ?? post.seo.twitter.imageLegacyId,
          ) ?? coverUrl,
        no_index: post.seo.noIndex,
        status: 'published',
        published_at: post.publishedAt ?? post.createdAt,
        created_at: post.createdAt ?? post.publishedAt,
        updated_at: post.updatedAt ?? post.createdAt ?? post.publishedAt,
        author_type: 'custom',
        author_display_name: truncate(author.displayName, 100),
        author_studio_member_id: null,
        author_placement: 'after_title',
        legacy_source_id: WORDPRESS_SOURCE_ID,
        legacy_post_id: post.legacyId,
        legacy_source_url: post.legacyUrl,
        legacy_content_html: conversion.legacyContentHtml,
        legacy_source_checksum_sha256: post.checksumSha256,
        legacy_source_updated_at: post.updatedAt,
      };
      if (
        !row.title_ar ||
        !row.body_ar ||
        !row.published_at ||
        !row.created_at ||
        !row.updated_at
      ) {
        throw new Error('required title, body, or dates are missing');
      }
      articles.push({
        id: articleId,
        row,
        sourceChecksumSha256: post.checksumSha256,
        legacyRecords: [
          importedRecord({
            entityType: 'post',
            legacyId: post.legacyId,
            slug: post.slug,
            legacyUrl: post.legacyUrl,
            targetKind: 'article',
            targetId: articleId,
            sourceChecksumSha256: post.checksumSha256,
            metadata: {
              wordpress_author_id: author.legacyId,
              person_id: personId,
              content_conversion: conversion.stats,
              featured_media_legacy_id: post.featuredMediaLegacyId,
            },
          }),
        ],
      });
      articleAuthors.push({
        article_id: articleId,
        person_id: personId,
        position: 0,
        display_name_snapshot: truncate(author.displayName, 160) ?? author.displayName,
      });
    } catch (error) {
      errors.push(
        `Post ${post.legacyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  articleDependencies.sort((left, right) => left.legacyPostId - right.legacyPostId);
  blockedArticles.sort(
    (left, right) => (left.legacy_numeric_id ?? 0) - (right.legacy_numeric_id ?? 0),
  );
  return { articles, blockedArticles, articleDependencies, articleAuthors };
}

function bookPlan(
  manifest: WordPressManifest,
  people: PlannedEntity[],
  mediaResolutions: Map<number, MediaResolution>,
  errors: string[],
): PlannedEntity[] {
  const peopleByName = new Map(
    people.map((person) => [normalizedPersonName(String(person.row.display_name)), person.id]),
  );
  return manifest.candidates.book.flatMap((book) => {
    try {
      const title = (book.book?.name ?? book.title).trim();
      const summary = convertWordPressContent(
        book.book?.descriptionHtml ?? book.contentHtml,
      ).legacyContentHtml;
      const coverUrl = resolvedMediaUrl(mediaResolutions, book.book?.imageLegacyId ?? null);
      const guestName = book.book?.guestName?.trim() ?? null;
      const bookId = `book-wp-${book.legacyId}`;
      const row: DatabaseRow = {
        id: bookId,
        slug: book.suggestedTargetSlug,
        title_ar: title,
        summary_html: summary,
        cover_url: coverUrl,
        cover_alt: coverUrl ? title : null,
        discussed_with_person_id: guestName
          ? (peopleByName.get(normalizedPersonName(guestName)) ?? null)
          : null,
        discussed_with_name_snapshot: truncate(guestName, 160),
        related_episode_url: safeHttpUrl(book.book?.episodeUrl),
        status: 'published',
        published_at: book.publishedAt ?? book.createdAt,
        created_at: book.createdAt ?? book.publishedAt,
        updated_at: book.updatedAt ?? book.createdAt ?? book.publishedAt,
      };
      if (!title || !row.published_at || !row.created_at || !row.updated_at) {
        throw new Error('required title or dates are missing');
      }
      return [
        {
          id: bookId,
          row,
          sourceChecksumSha256: book.checksumSha256,
          legacyRecords: [
            importedRecord({
              entityType: 'book',
              legacyId: book.legacyId,
              slug: book.slug,
              legacyUrl: book.legacyUrl,
              targetKind: 'book',
              targetId: bookId,
              sourceChecksumSha256: book.checksumSha256,
              metadata: {
                book_image_legacy_id: book.book?.imageLegacyId,
                discussed_with_source_name: guestName,
              },
            }),
          ],
        },
      ];
    } catch (error) {
      errors.push(
        `Book ${book.legacyId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  });
}

function redirectPlan(manifest: WordPressManifest): {
  redirects: DatabaseRow[];
  excluded: ExcludedRedirect[];
} {
  const grouped = new Map<string, ProposedRedirect[]>();
  for (const redirect of manifest.proposedRedirects) {
    grouped.set(redirect.sourcePath, [...(grouped.get(redirect.sourcePath) ?? []), redirect]);
  }
  const redirects: DatabaseRow[] = [];
  const excluded: ExcludedRedirect[] = [];
  for (const [sourcePath, candidates] of grouped) {
    const targets = new Set(
      candidates.map((candidate) => `${candidate.statusCode}:${candidate.destination}`),
    );
    let reason: ExcludedRedirect['reason'] | null = null;
    if (targets.size > 1) reason = 'collision';
    else if (!candidates.some((candidate) => candidate.enabled)) reason = 'disabled';
    else if (candidates.some((candidate) => candidate.requiresReview)) reason = 'requires-review';
    if (reason) {
      excluded.push({
        sourcePath,
        reason,
        candidates: candidates.map((candidate) => ({
          destination: candidate.destination,
          statusCode: candidate.statusCode,
          source: candidate.source,
          legacyRecordId: candidate.legacyRecordId,
        })),
      });
      continue;
    }
    const candidate =
      candidates.find((entry) => entry.source === 'wordpress-redirection' && entry.enabled) ??
      candidates.find((entry) => entry.enabled)!;
    redirects.push({
      source_path: candidate.sourcePath,
      destination: candidate.destination,
      status_code: candidate.statusCode,
      is_active: true,
      legacy_import_record_id: null,
      source_label:
        candidate.source === 'wordpress-redirection'
          ? 'wordpress-redirection'
          : candidate.reason === 'old-slug'
            ? 'wordpress-old-slug'
            : 'wordpress-canonical',
    });
  }
  redirects.sort((left, right) =>
    String(left.source_path).localeCompare(String(right.source_path)),
  );
  excluded.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return { redirects, excluded };
}

export function buildWordPressApplyPlan(
  manifest: WordPressManifest,
  storage: VerifiedR2MediaStorage,
  externalStorage: VerifiedExternalR2MediaStorage,
): WordPressApplyPlan {
  const warnings: string[] = [];
  const errors: string[] = [];
  const withoutChecksum = omitChecksum(manifest);
  if (checksumObject(withoutChecksum) !== manifest.checksumSha256) {
    errors.push('Manifest checksum does not match its content');
  }
  const mediaResult = mediaPlan(manifest, storage, externalStorage);
  const identities = identityPlan(manifest, warnings, mediaResult.resolutions);
  const articleResult = articlePlan(
    manifest,
    identities.authorTargets,
    mediaResult.resolutions,
    mediaResult.externalResolutions,
    warnings,
    errors,
  );
  const books = bookPlan(manifest, identities.people, mediaResult.resolutions, errors);
  const pendingPages = manifest.candidates.page.map((record) =>
    pendingRecord({
      entityType: 'page',
      record,
      targetKind: 'page',
      metadata: {
        title: record.title,
        suggested_target_slug: record.suggestedTargetSlug,
        route_status: 'not_implemented',
      },
    }),
  );
  const redirectResult = redirectPlan(manifest);
  const draft = {
    schemaVersion: 2 as const,
    source: {
      id: WORDPRESS_SOURCE_ID,
      source_kind: 'wordpress_wxr' as const,
      source_url: manifest.source.siteUrl,
      source_checksum_sha256: manifest.source.sourceChecksumSha256,
      manifest_checksum_sha256: manifest.checksumSha256,
    },
    mediaStorage: {
      schemaVersion: storage.schemaVersion,
      deploymentEnvironment: storage.deploymentEnvironment,
      bucket: storage.bucket,
      prefix: storage.prefix,
      mediaPublicOrigin: storage.mediaPublicOrigin,
      mediaDownloadReportChecksumSha256: storage.mediaDownloadReportChecksumSha256,
      r2VerificationReportChecksumSha256: storage.r2VerificationReportChecksumSha256,
      externalR2VerificationReportChecksumSha256:
        externalStorage.r2VerificationReportChecksumSha256,
      itemCount: storage.items.length,
      externalItemCount: externalStorage.items.length,
    },
    people: identities.people,
    mediaAssets: mediaResult.mediaAssets,
    articles: articleResult.articles,
    blockedArticles: articleResult.blockedArticles,
    articleDependencies: articleResult.articleDependencies,
    articleAuthors: articleResult.articleAuthors,
    books,
    pendingPages,
    pendingMedia: mediaResult.pendingMedia,
    externalInlineMedia: externalInlineMedia(articleResult.articleDependencies),
    redirects: redirectResult.redirects,
    excludedRedirects: redirectResult.excluded,
    warnings,
    errors,
  };
  return { ...draft, checksumSha256: checksumObject(draft) };
}
