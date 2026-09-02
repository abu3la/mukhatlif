export const WORDPRESS_CORE_TYPES = ['post', 'page', 'team_member', 'book', 'attachment'] as const;

export type WordPressCoreType = (typeof WORDPRESS_CORE_TYPES)[number];

export interface WordPressAuthor {
  legacyId: number;
  login: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  checksumSha256: string;
}

export interface WordPressTermAssignment {
  domain: string;
  slug: string;
  label: string;
}

export interface WordPressSeo {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  focusKeyword: string | null;
  primaryCategoryLegacyId: number | null;
  openGraph: {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    imageLegacyId: number | null;
  };
  twitter: {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    imageLegacyId: number | null;
  };
}

export interface WordPressBuilderContent {
  kind: 'elementor';
  data: string;
  pageSettings: string | null;
  formSnapshot: string | null;
  checksumSha256: string;
}

export interface WordPressMediaDetails {
  source: 'wxr' | 'wxr+rest' | 'rest';
  sourceUrl: string | null;
  attachedFile: string | null;
  mimeType: string | null;
  altText: string | null;
  captionHtml: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
}

export interface WordPressTeamMemberFields {
  name: string | null;
  position: string | null;
  imageLegacyId: number | null;
  socials: {
    x: string | null;
    instagram: string | null;
    linkedin: string | null;
    snapchat: string | null;
  };
}

export interface WordPressBookFields {
  name: string | null;
  descriptionHtml: string | null;
  imageLegacyId: number | null;
  guestName: string | null;
  episodeUrl: string | null;
}

export interface WordPressRecord {
  legacyId: number;
  postType: string;
  status: string;
  title: string;
  slug: string;
  suggestedTargetSlug: string;
  legacyUrl: string | null;
  guid: string | null;
  authorLogin: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  parentLegacyId: number | null;
  menuOrder: number;
  contentHtml: string;
  excerptHtml: string;
  featuredMediaLegacyId: number | null;
  terms: WordPressTermAssignment[];
  oldSlugs: string[];
  seo: WordPressSeo;
  builder: WordPressBuilderContent | null;
  media: WordPressMediaDetails | null;
  teamMember: WordPressTeamMemberFields | null;
  book: WordPressBookFields | null;
  checksumSha256: string;
}

export interface WordPressManifest {
  schemaVersion: 1;
  source: {
    kind: 'wordpress_wxr';
    siteUrl: string;
    blogUrl: string;
    title: string;
    description: string;
    language: string;
    wxrVersion: string;
    generator: string | null;
    exportedAt: string | null;
    sourceFile: string;
    sourceChecksumSha256: string;
  };
  authors: WordPressAuthor[];
  candidates: Record<WordPressCoreType, WordPressRecord[]>;
  deferred: WordPressRecord[];
  ignored: {
    byPostType: Record<string, number>;
    total: number;
  };
  proposedRedirects: ProposedRedirect[];
  checksumSha256: string;
}

export interface ProposedRedirect {
  source: 'derived' | 'wordpress-redirection';
  legacyRecordType: string | null;
  legacyRecordId: number | null;
  sourcePath: string;
  destination: string;
  reason: 'canonical-route' | 'old-slug' | 'plugin-export';
  statusCode: 301 | 302 | 307 | 308;
  enabled: boolean;
  requiresReview: boolean;
  pluginRedirectId: number | null;
}

export interface PodcastEpisodeManifest {
  legacyGuid: string;
  title: string;
  descriptionHtml: string;
  contentHtml: string;
  link: string | null;
  publishedAt: string | null;
  enclosureUrl: string | null;
  enclosureMimeType: string | null;
  enclosureByteSize: number | null;
  durationSeconds: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  episodeType: string | null;
  imageUrl: string | null;
  explicit: string | null;
  checksumSha256: string;
}

export interface PodcastFeedManifest {
  schemaVersion: 1;
  showSlug: string;
  source: string;
  title: string;
  description: string;
  language: string | null;
  author: string | null;
  imageUrl: string | null;
  episodes: PodcastEpisodeManifest[];
  checksumSha256: string;
}

export interface RestMediaRecord {
  id: number;
  sourceUrl: string;
  mimeType: string | null;
  altText: string | null;
  captionHtml: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  originalPath: string | null;
}

export interface MediaReconciliation {
  wxrCount: number;
  restCount: number;
  matchedCount: number;
  missingFromRest: number[];
  missingFromWxr: number[];
}

export interface ImportIssue {
  code: string;
  level: 'warning' | 'error';
  entityType: string | null;
  legacyId: number | null;
  message: string;
}

export interface WordPressDryRunReport {
  schemaVersion: 1;
  generatedAt: string;
  sourceChecksumSha256: string;
  manifestChecksumSha256: string;
  inputChecksumsSha256: Record<string, string>;
  counts: {
    authors: number;
    candidates: Record<WordPressCoreType, number>;
    deferredByPostTypeAndStatus: Record<string, number>;
    ignoredByPostType: Record<string, number>;
    proposedRedirects: number;
    oldSlugRedirects: number;
    activeOldSlugRedirects: number;
    reviewOldSlugRedirects: number;
    pluginRedirects: number;
    podcastFeeds: number;
    podcastEpisodes: number;
  };
  checksumsByEntityType: Record<string, string>;
  mediaReconciliation: MediaReconciliation | null;
  issues: ImportIssue[];
}

export interface WordPressRedirectionExport {
  plugin?: {
    version?: string;
    date?: string;
  };
  groups?: unknown[];
  redirects?: unknown[];
}

export interface MediaDownloadResult {
  legacyId: number;
  sourceUrl: string;
  finalUrl: string | null;
  relativePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  checksumSha256: string | null;
  disposition: 'downloaded' | 'reused' | 'failed';
  error: string | null;
}

export interface MediaDownloadReport {
  schemaVersion: 1;
  generatedAt: string;
  requested: number;
  downloaded: number;
  reused: number;
  failed: number;
  results: MediaDownloadResult[];
}
