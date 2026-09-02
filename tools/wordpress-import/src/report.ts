import { checksumObject } from './hash.ts';
import {
  WORDPRESS_CORE_TYPES,
  type ImportIssue,
  type MediaReconciliation,
  type PodcastFeedManifest,
  type WordPressDryRunReport,
  type WordPressManifest,
  type WordPressRecord,
} from './types.ts';

function duplicateIssues(
  records: WordPressRecord[],
  key: (record: WordPressRecord) => string,
  code: string,
  label: string,
): ImportIssue[] {
  const grouped = new Map<string, WordPressRecord[]>();
  for (const record of records) {
    const value = key(record);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), record]);
  }
  return [...grouped.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([value, matches]) => ({
      code,
      level: 'error' as const,
      entityType: matches[0].postType,
      legacyId: matches[0].legacyId,
      message: `${label} “${value}” is shared by legacy IDs ${matches
        .map((record) => record.legacyId)
        .join(', ')}`,
    }));
}

function redirectIssues(manifest: WordPressManifest): ImportIssue[] {
  const grouped = new Map<string, typeof manifest.proposedRedirects>();
  for (const redirect of manifest.proposedRedirects) {
    grouped.set(redirect.sourcePath, [...(grouped.get(redirect.sourcePath) ?? []), redirect]);
  }
  const issues: ImportIssue[] = [];
  for (const [sourcePath, matches] of grouped) {
    const destinations = new Set(
      matches.map((redirect) => `${redirect.statusCode}:${redirect.destination}`),
    );
    if (destinations.size > 1) {
      const targets = [...destinations];
      const preview = targets.slice(0, 5).join(', ');
      issues.push({
        code: 'redirect-collision',
        level: 'error',
        entityType: 'redirect',
        legacyId: matches[0].legacyRecordId,
        message: `${sourcePath} has ${targets.length} conflicting targets: ${preview}${
          targets.length > 5 ? `, and ${targets.length - 5} more` : ''
        }`,
      });
    }
  }
  return issues;
}

function recordIssues(manifest: WordPressManifest): ImportIssue[] {
  const mediaIds = new Set(manifest.candidates.attachment.map((record) => record.legacyId));
  const records = WORDPRESS_CORE_TYPES.flatMap((type) => manifest.candidates[type]);
  const authorLogins = new Set(manifest.authors.map((author) => author.login));
  const issues: ImportIssue[] = [];
  for (const record of records) {
    if (!record.title.trim() && record.postType !== 'attachment') {
      issues.push({
        code: 'missing-title',
        level: 'warning',
        entityType: record.postType,
        legacyId: record.legacyId,
        message: 'Migration candidate has no title',
      });
    }
    if (record.slug !== record.suggestedTargetSlug) {
      issues.push({
        code: 'generated-target-slug',
        level: 'warning',
        entityType: record.postType,
        legacyId: record.legacyId,
        message: `Legacy slug “${record.slug}” needs review; suggested target is “${record.suggestedTargetSlug}”`,
      });
    }
    if (record.featuredMediaLegacyId && !mediaIds.has(record.featuredMediaLegacyId)) {
      issues.push({
        code: 'missing-featured-media',
        level: 'error',
        entityType: record.postType,
        legacyId: record.legacyId,
        message: `Featured media ${record.featuredMediaLegacyId} is absent from WXR attachments`,
      });
    }
    if (record.authorLogin && !authorLogins.has(record.authorLogin)) {
      issues.push({
        code: 'missing-author',
        level: 'error',
        entityType: record.postType,
        legacyId: record.legacyId,
        message: `Author login “${record.authorLogin}” is absent from WXR authors`,
      });
    }
  }
  issues.push(
    ...duplicateIssues(
      records.filter((record) => record.postType !== 'attachment'),
      (record) => `${record.postType}:${record.legacyId}`,
      'duplicate-legacy-id',
      'Legacy identity',
    ),
    ...duplicateIssues(
      records.filter((record) => record.postType !== 'attachment'),
      (record) => `${record.postType}:${record.suggestedTargetSlug}`,
      'duplicate-target-slug',
      'Target slug',
    ),
  );
  return issues;
}

export function buildDryRunReport(options: {
  manifest: WordPressManifest;
  mediaReconciliation?: MediaReconciliation | null;
  podcastFeeds?: PodcastFeedManifest[];
  inputChecksumsSha256?: Record<string, string>;
  generatedAt?: string;
}): WordPressDryRunReport {
  const { manifest } = options;
  const deferredByPostTypeAndStatus: Record<string, number> = {};
  for (const record of manifest.deferred) {
    const key = `${record.postType}:${record.status}`;
    deferredByPostTypeAndStatus[key] = (deferredByPostTypeAndStatus[key] ?? 0) + 1;
  }
  const checksumsByEntityType: Record<string, string> = {
    authors: checksumObject(manifest.authors.map((author) => author.checksumSha256)),
  };
  for (const type of WORDPRESS_CORE_TYPES) {
    checksumsByEntityType[type] = checksumObject(
      manifest.candidates[type].map((record) => record.checksumSha256),
    );
  }
  const podcastFeeds = options.podcastFeeds ?? [];
  for (const feed of podcastFeeds)
    checksumsByEntityType[`rss:${feed.showSlug}`] = feed.checksumSha256;
  const issues = [...recordIssues(manifest), ...redirectIssues(manifest)];
  if (options.mediaReconciliation?.missingFromRest.length) {
    issues.push({
      code: 'media-missing-from-rest',
      level: 'warning',
      entityType: 'attachment',
      legacyId: options.mediaReconciliation.missingFromRest[0] ?? null,
      message: `${options.mediaReconciliation.missingFromRest.length} WXR attachment(s) are missing from the REST media export`,
    });
  }
  if (options.mediaReconciliation?.missingFromWxr.length) {
    issues.push({
      code: 'media-missing-from-wxr',
      level: 'warning',
      entityType: 'attachment',
      legacyId: options.mediaReconciliation.missingFromWxr[0] ?? null,
      message: `${options.mediaReconciliation.missingFromWxr.length} REST media record(s) are missing from WXR`,
    });
  }
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceChecksumSha256: manifest.source.sourceChecksumSha256,
    manifestChecksumSha256: manifest.checksumSha256,
    inputChecksumsSha256: options.inputChecksumsSha256 ?? {
      wxr: manifest.source.sourceChecksumSha256,
    },
    counts: {
      authors: manifest.authors.length,
      candidates: Object.fromEntries(
        WORDPRESS_CORE_TYPES.map((type) => [type, manifest.candidates[type].length]),
      ) as WordPressDryRunReport['counts']['candidates'],
      deferredByPostTypeAndStatus,
      ignoredByPostType: manifest.ignored.byPostType,
      proposedRedirects: manifest.proposedRedirects.length,
      oldSlugRedirects: manifest.proposedRedirects.filter(
        (redirect) => redirect.reason === 'old-slug',
      ).length,
      activeOldSlugRedirects: manifest.proposedRedirects.filter(
        (redirect) => redirect.reason === 'old-slug' && redirect.enabled,
      ).length,
      reviewOldSlugRedirects: manifest.proposedRedirects.filter(
        (redirect) => redirect.reason === 'old-slug' && !redirect.enabled,
      ).length,
      pluginRedirects: manifest.proposedRedirects.filter(
        (redirect) => redirect.source === 'wordpress-redirection',
      ).length,
      podcastFeeds: podcastFeeds.length,
      podcastEpisodes: podcastFeeds.reduce((sum, feed) => sum + feed.episodes.length, 0),
    },
    checksumsByEntityType,
    mediaReconciliation: options.mediaReconciliation ?? null,
    issues: issues.sort(
      (left, right) =>
        left.level.localeCompare(right.level) ||
        left.code.localeCompare(right.code) ||
        (left.legacyId ?? 0) - (right.legacyId ?? 0),
    ),
  };
}
