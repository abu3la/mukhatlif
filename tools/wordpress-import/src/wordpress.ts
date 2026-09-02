import { checksumObject, omitChecksum, sha256 } from './hash.ts';
import {
  WORDPRESS_CORE_TYPES,
  type ProposedRedirect,
  type WordPressAuthor,
  type WordPressBookFields,
  type WordPressCoreType,
  type WordPressManifest,
  type WordPressRecord,
  type WordPressRedirectionExport,
  type WordPressSeo,
  type WordPressTeamMemberFields,
  type WordPressTermAssignment,
} from './types.ts';
import { elementText, extractElements, firstElement, firstText } from './xml.ts';

const CORE_TYPE_SET = new Set<string>(WORDPRESS_CORE_TYPES);
const TARGET_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ParseWordPressOptions {
  sourceFile: string;
  sourceChecksumSha256?: string;
}

interface ParsedMeta {
  all: Map<string, string[]>;
  first(key: string): string | null;
  integer(key: string): number | null;
}

function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  const result = Number.parseInt(value, 10);
  return Number.isSafeInteger(result) ? result : null;
}

function parseDate(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.startsWith('0000-00-00')) return null;
  const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)
    ? `${normalized.replace(' ', 'T')}Z`
    : normalized;
  const date = new Date(candidate);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function parseMeta(itemXml: string): ParsedMeta {
  const all = new Map<string, string[]>();
  for (const element of extractElements(itemXml, 'wp:postmeta')) {
    const key = firstText(element.inner, 'wp:meta_key');
    if (!key) continue;
    const value = firstText(element.inner, 'wp:meta_value');
    all.set(key, [...(all.get(key) ?? []), value]);
  }
  return {
    all,
    first(key) {
      return all.get(key)?.[0] ?? null;
    },
    integer(key) {
      const value = all.get(key)?.[0];
      return value === undefined ? null : parseInteger(value);
    },
  };
}

function nullIfBlank(value: string | null): string | null {
  if (value === null) return null;
  return value.trim() ? value : null;
}

function parseSeo(meta: ParsedMeta): WordPressSeo {
  return {
    title: nullIfBlank(meta.first('_yoast_wpseo_title')),
    description: nullIfBlank(meta.first('_yoast_wpseo_metadesc')),
    canonicalUrl: nullIfBlank(meta.first('_yoast_wpseo_canonical')),
    noIndex: meta.first('_yoast_wpseo_meta-robots-noindex') === '1',
    focusKeyword: nullIfBlank(meta.first('_yoast_wpseo_focuskw')),
    primaryCategoryLegacyId: meta.integer('_yoast_wpseo_primary_category'),
    openGraph: {
      title: nullIfBlank(meta.first('_yoast_wpseo_opengraph-title')),
      description: nullIfBlank(meta.first('_yoast_wpseo_opengraph-description')),
      imageUrl: nullIfBlank(meta.first('_yoast_wpseo_opengraph-image')),
      imageLegacyId: meta.integer('_yoast_wpseo_opengraph-image-id'),
    },
    twitter: {
      title: nullIfBlank(meta.first('_yoast_wpseo_twitter-title')),
      description: nullIfBlank(meta.first('_yoast_wpseo_twitter-description')),
      imageUrl: nullIfBlank(meta.first('_yoast_wpseo_twitter-image')),
      imageLegacyId: meta.integer('_yoast_wpseo_twitter-image-id'),
    },
  };
}

function parseTerms(itemXml: string): WordPressTermAssignment[] {
  return extractElements(itemXml, 'category').map((element) => ({
    domain: element.attributes.domain ?? '',
    slug: element.attributes.nicename ?? '',
    label: elementText(element),
  }));
}

function parseTeamMember(meta: ParsedMeta): WordPressTeamMemberFields {
  return {
    name: nullIfBlank(meta.first('member_name')),
    position: nullIfBlank(meta.first('member_position')),
    imageLegacyId: meta.integer('image'),
    socials: {
      x: nullIfBlank(meta.first('X_url')),
      instagram: nullIfBlank(meta.first('Instagram_url')),
      linkedin: nullIfBlank(meta.first('Linked_in_url')),
      snapchat: nullIfBlank(meta.first('Snapchat_url')),
    },
  };
}

function parseBook(meta: ParsedMeta): WordPressBookFields {
  return {
    name: nullIfBlank(meta.first('book_name')),
    descriptionHtml: nullIfBlank(meta.first('Book_Description')),
    imageLegacyId: meta.integer('book_image'),
    guestName: nullIfBlank(meta.first('Guest_Name')),
    episodeUrl: nullIfBlank(meta.first('ebisode_url')),
  };
}

function suggestedTargetSlug(postType: string, legacyId: number, slug: string): string {
  const normalized = slug.toLowerCase();
  return TARGET_SLUG.test(normalized)
    ? normalized
    : `legacy-${postType.replaceAll('_', '-')}-${legacyId}`;
}

function parseRecord(itemXml: string): WordPressRecord {
  const meta = parseMeta(itemXml);
  const legacyId = parseInteger(firstText(itemXml, 'wp:post_id')) ?? 0;
  const postType = firstText(itemXml, 'wp:post_type');
  const slug = firstText(itemXml, 'wp:post_name');
  const elementorData = meta.first('_elementor_data');
  const builder = elementorData
    ? {
        kind: 'elementor' as const,
        data: elementorData,
        pageSettings: meta.first('_elementor_page_settings'),
        formSnapshot: meta.first('__elementor_forms_snapshot'),
        checksumSha256: sha256(elementorData),
      }
    : null;
  const media =
    postType === 'attachment'
      ? {
          source: 'wxr' as const,
          sourceUrl: nullIfBlank(firstText(itemXml, 'wp:attachment_url')),
          attachedFile: nullIfBlank(meta.first('_wp_attached_file')),
          mimeType: nullIfBlank(firstText(itemXml, 'wp:post_mime_type')),
          altText: nullIfBlank(meta.first('_wp_attachment_image_alt')),
          captionHtml: nullIfBlank(firstText(itemXml, 'excerpt:encoded')),
          width: null,
          height: null,
          byteSize: null,
        }
      : null;

  const withoutChecksum = {
    legacyId,
    postType,
    status: firstText(itemXml, 'wp:status'),
    title: firstText(itemXml, 'title'),
    slug,
    suggestedTargetSlug: suggestedTargetSlug(postType, legacyId, slug),
    legacyUrl: nullIfBlank(firstText(itemXml, 'link')),
    guid: nullIfBlank(firstText(itemXml, 'guid')),
    authorLogin: nullIfBlank(firstText(itemXml, 'dc:creator')),
    publishedAt: parseDate(firstText(itemXml, 'pubDate')),
    createdAt:
      parseDate(firstText(itemXml, 'wp:post_date_gmt')) ??
      parseDate(firstText(itemXml, 'wp:post_date')),
    updatedAt:
      parseDate(firstText(itemXml, 'wp:post_modified_gmt')) ??
      parseDate(firstText(itemXml, 'wp:post_modified')),
    parentLegacyId: parseInteger(firstText(itemXml, 'wp:post_parent')) || null,
    menuOrder: parseInteger(firstText(itemXml, 'wp:menu_order')) ?? 0,
    contentHtml: firstText(itemXml, 'content:encoded'),
    excerptHtml: firstText(itemXml, 'excerpt:encoded'),
    featuredMediaLegacyId: meta.integer('_thumbnail_id'),
    terms: parseTerms(itemXml),
    oldSlugs: [...new Set(meta.all.get('_wp_old_slug') ?? [])].sort(),
    seo: parseSeo(meta),
    builder,
    media,
    teamMember: postType === 'team_member' ? parseTeamMember(meta) : null,
    book: postType === 'book' ? parseBook(meta) : null,
  };
  return { ...withoutChecksum, checksumSha256: checksumObject(withoutChecksum) };
}

function parseAuthors(channelXml: string): WordPressAuthor[] {
  return extractElements(channelXml, 'wp:author')
    .map((element) => {
      const withoutChecksum = {
        legacyId: parseInteger(firstText(element.inner, 'wp:author_id')) ?? 0,
        login: firstText(element.inner, 'wp:author_login'),
        email: firstText(element.inner, 'wp:author_email').toLowerCase(),
        displayName: firstText(element.inner, 'wp:author_display_name'),
        firstName: firstText(element.inner, 'wp:author_first_name'),
        lastName: firstText(element.inner, 'wp:author_last_name'),
      };
      return { ...withoutChecksum, checksumSha256: checksumObject(withoutChecksum) };
    })
    .sort((left, right) => left.legacyId - right.legacyId);
}

function isCandidate(record: WordPressRecord): record is WordPressRecord & {
  postType: WordPressCoreType;
} {
  if (!CORE_TYPE_SET.has(record.postType)) return false;
  if (record.postType === 'attachment') return record.status === 'inherit';
  return record.status === 'publish';
}

function pathFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value.startsWith('/') ? value : null;
  }
}

function targetPath(record: WordPressRecord): string | null {
  const slug = encodeURIComponent(record.suggestedTargetSlug);
  if (record.postType === 'post') return `/articles/${slug}`;
  if (record.postType === 'team_member') return `/people/${slug}`;
  if (record.postType === 'book') return `/books/${slug}`;
  if (record.postType === 'page') return pathFromUrl(record.legacyUrl);
  return null;
}

function normalizeRedirectPath(path: string): string {
  const [pathname, query] = path.split('?', 2);
  const canonicalSegments = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return segment.replace(/%[0-9a-f]{2}/gi, (value) => value.toUpperCase());
      }
    });
  const normalizedPath = canonicalSegments.length ? `/${canonicalSegments.join('/')}/` : '/';
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function buildRedirects(
  candidates: Record<WordPressCoreType, WordPressRecord[]>,
  deferred: WordPressRecord[],
  ignored: WordPressRecord[],
): ProposedRedirect[] {
  const redirects: ProposedRedirect[] = [];
  const candidateRecords = WORDPRESS_CORE_TYPES.flatMap((type) => candidates[type]);
  const candidateKeys = new Set(
    candidateRecords.map((record) => `${record.postType}:${record.legacyId}`),
  );
  const records = [...candidateRecords, ...deferred, ...ignored];
  for (const record of records) {
    const destination = targetPath(record);
    const source = pathFromUrl(record.legacyUrl);
    const enabled = candidateKeys.has(`${record.postType}:${record.legacyId}`);
    if (
      destination &&
      source &&
      normalizeRedirectPath(source) !== normalizeRedirectPath(destination)
    ) {
      redirects.push({
        source: 'derived',
        legacyRecordType: record.postType,
        legacyRecordId: record.legacyId,
        sourcePath: normalizeRedirectPath(source),
        destination: normalizeRedirectPath(destination),
        reason: 'canonical-route',
        statusCode: 301,
        enabled,
        requiresReview: !enabled,
        pluginRedirectId: null,
      });
    }
    for (const oldSlug of record.oldSlugs) {
      const oldPath = normalizeRedirectPath(`/${oldSlug}`);
      const oldDestination = destination ?? source;
      if (!oldDestination || oldPath === normalizeRedirectPath(oldDestination)) continue;
      redirects.push({
        source: 'derived',
        legacyRecordType: record.postType,
        legacyRecordId: record.legacyId,
        sourcePath: oldPath,
        destination: normalizeRedirectPath(oldDestination),
        reason: 'old-slug',
        statusCode: 301,
        enabled,
        requiresReview: !enabled,
        pluginRedirectId: null,
      });
    }
  }
  return redirects.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.destination.localeCompare(right.destination),
  );
}

export function parseWordPressWxr(xml: string, options: ParseWordPressOptions): WordPressManifest {
  const channel = firstElement(xml, 'channel');
  if (!channel) throw new Error('Invalid WXR: missing RSS channel');
  const records = extractElements(channel.inner, 'item').map((element) =>
    parseRecord(element.inner),
  );
  const candidates = Object.fromEntries(
    WORDPRESS_CORE_TYPES.map((type) => [type, [] as WordPressRecord[]]),
  ) as Record<WordPressCoreType, WordPressRecord[]>;
  const deferred: WordPressRecord[] = [];
  const ignoredRecords: WordPressRecord[] = [];
  const ignoredByPostType: Record<string, number> = {};

  for (const record of records) {
    if (isCandidate(record)) {
      candidates[record.postType].push(record);
    } else if (CORE_TYPE_SET.has(record.postType)) {
      deferred.push(record);
    } else {
      ignoredRecords.push(record);
      ignoredByPostType[record.postType] = (ignoredByPostType[record.postType] ?? 0) + 1;
    }
  }
  for (const type of WORDPRESS_CORE_TYPES) {
    candidates[type].sort((left, right) => left.legacyId - right.legacyId);
  }
  deferred.sort((left, right) => left.legacyId - right.legacyId);

  const generatorMatch = xml.match(/generator="([^"]+)"/);
  const withoutChecksum = {
    schemaVersion: 1 as const,
    source: {
      kind: 'wordpress_wxr' as const,
      siteUrl: firstText(channel.inner, 'wp:base_site_url') || firstText(channel.inner, 'link'),
      blogUrl: firstText(channel.inner, 'wp:base_blog_url') || firstText(channel.inner, 'link'),
      title: firstText(channel.inner, 'title'),
      description: firstText(channel.inner, 'description'),
      language: firstText(channel.inner, 'language'),
      wxrVersion: firstText(channel.inner, 'wp:wxr_version'),
      generator: generatorMatch?.[1] ?? null,
      exportedAt: parseDate(firstText(channel.inner, 'pubDate')),
      sourceFile: options.sourceFile,
      sourceChecksumSha256: options.sourceChecksumSha256 ?? sha256(xml),
    },
    authors: parseAuthors(channel.inner),
    candidates,
    deferred,
    ignored: {
      byPostType: Object.fromEntries(
        Object.entries(ignoredByPostType).sort(([left], [right]) => left.localeCompare(right)),
      ),
      total: Object.values(ignoredByPostType).reduce((sum, count) => sum + count, 0),
    },
    proposedRedirects: buildRedirects(candidates, deferred, ignoredRecords),
  };
  return { ...withoutChecksum, checksumSha256: checksumObject(withoutChecksum) };
}

function redirectStatusCode(value: unknown): 301 | 302 | 307 | 308 {
  return value === 302 || value === 307 || value === 308 ? value : 301;
}

function pluginRedirect(value: unknown): ProposedRedirect | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const actionData =
    source.action_data && typeof source.action_data === 'object'
      ? (source.action_data as Record<string, unknown>)
      : {};
  const sourcePath = typeof source.url === 'string' ? source.url : null;
  const destination = typeof actionData.url === 'string' ? actionData.url : null;
  if (!sourcePath?.startsWith('/') || !destination) return null;
  return {
    source: 'wordpress-redirection',
    legacyRecordType: null,
    legacyRecordId: null,
    sourcePath: normalizeRedirectPath(sourcePath),
    destination: destination.startsWith('/') ? normalizeRedirectPath(destination) : destination,
    reason: 'plugin-export',
    statusCode: redirectStatusCode(source.action_code),
    enabled: source.enabled !== false,
    requiresReview: source.regex === true || source.action_type !== 'url',
    pluginRedirectId: typeof source.id === 'number' ? source.id : null,
  };
}

export function addWordPressRedirectionExport(
  manifest: WordPressManifest,
  exported: WordPressRedirectionExport,
): WordPressManifest {
  const pluginRedirects = (exported.redirects ?? [])
    .map((redirect) => pluginRedirect(redirect))
    .filter((redirect): redirect is ProposedRedirect => redirect !== null);
  const withoutChecksum = omitChecksum(manifest);
  const merged = {
    ...withoutChecksum,
    proposedRedirects: [...manifest.proposedRedirects, ...pluginRedirects].sort(
      (left, right) =>
        left.sourcePath.localeCompare(right.sourcePath) ||
        left.destination.localeCompare(right.destination),
    ),
  };
  return { ...merged, checksumSha256: checksumObject(merged) };
}
