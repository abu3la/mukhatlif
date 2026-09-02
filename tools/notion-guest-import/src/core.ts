export const DEVELOPMENT_SUPABASE_PROJECT_REF = 'pacpdxvujkjvnaeeuute';

export const PRODUCT_TO_SHOW_ID: Readonly<Record<string, string>> = {
  'https://app.notion.com/1b3ab5ab63da80cbbd68c8acb761b797': 'shw-arwiqah',
  'https://app.notion.com/186ab5ab63da814c96fce1d0f067c420': 'shw-awalim',
  'https://app.notion.com/186ab5ab63da8181aa27cf2664aa9497': 'shw-bokra',
  'https://app.notion.com/186ab5ab63da8154b008cf00af088f80': 'shw-gilaf',
  'https://app.notion.com/186ab5ab63da81d08ff1e1ee2bf3f682': 'shw-hageeba',
  'https://app.notion.com/1beab5ab63da80e98291d4466f7ce03d': 'shw-imkan',
  'https://app.notion.com/1beab5ab63da8043aab3fd79b0f7929b': 'shw-istifham',
  'https://app.notion.com/186ab5ab63da8177aa4fc0e75f947201': 'shw-munagasha',
  'https://app.notion.com/186ab5ab63da81fb9fe5c5f811727ff9': 'shw-munawib',
  'https://app.notion.com/186ab5ab63da81ccb2b8dc3c63a704b5': 'shw-mustashar',
  'https://app.notion.com/186ab5ab63da816580dcfbc2f1e8fabe': 'shw-partition',
  'https://app.notion.com/186ab5ab63da817c917ce4ec7368eabb': 'shw-petroly',
  'https://app.notion.com/1ebab5ab63da8085aa44dd486cf860e7': 'shw-qadiyah',
  'https://app.notion.com/186ab5ab63da8149a93cf4c24ecce602': 'shw-scenario',
  'https://app.notion.com/186ab5ab63da8174bdb0c4942edd6d37': 'shw-seera',
  'https://app.notion.com/186ab5ab63da810f877ac9b2d671fb28': 'shw-shaqla',
};

const SNAPSHOT_KEYS = new Set([
  'schemaVersion',
  'source',
  'capturedAt',
  'episodeStatusFilter',
  'privacy',
  'counts',
  'guests',
  'publishedEpisodes',
]);
const PRIVACY_KEYS = new Set(['included', 'excluded']);
const COUNT_KEYS = new Set(['guests', 'publishedEpisodeRelations']);
const GUEST_KEYS = new Set([
  'url',
  'اسم الضيف',
  'المسمى التعريفي',
  'المدينة',
  'حسابات الضيف',
  'صورة الضيف',
  'عن الضيف ',
]);
const EPISODE_KEYS = new Set([
  'url',
  'عنوان الصفحة',
  'رابط الحلقة',
  'date:تاريخ النشر :start',
  'اسم الضيف',
  'المنتج',
  'userDefined:ID',
]);

export interface SanitizedNotionGuest {
  url: string;
  'اسم الضيف': string;
  'المسمى التعريفي': string | null;
  المدينة: string | null;
  'حسابات الضيف': string | null;
  'صورة الضيف': string | null;
  'عن الضيف ': string | null;
}

export interface SanitizedNotionEpisode {
  url: string;
  'عنوان الصفحة': string;
  'رابط الحلقة': string | null;
  'date:تاريخ النشر :start': string | null;
  'اسم الضيف': string | null;
  المنتج: string | null;
  'userDefined:ID': number | null;
}

export interface SanitizedNotionSnapshot {
  schemaVersion: 2;
  source: string;
  capturedAt: string;
  episodeStatusFilter: 'نشرت';
  privacy: { included: string[]; excluded: string[] };
  counts: { guests: number; publishedEpisodeRelations: number };
  guests: SanitizedNotionGuest[];
  publishedEpisodes: SanitizedNotionEpisode[];
}

export interface SupabasePublishedEpisode {
  id: string;
  show_id: string;
  title_ar: string;
  show_notes_ar: string;
  publish_at: string | null;
  legacy_url: string | null;
  source_url: string | null;
  audio_url: string | null;
  status: 'published';
}

export type MatchMethod =
  | 'exact_youtube_video'
  | 'strong_youtube_title_evidence'
  | 'show_date_all_guest_tokens'
  | 'show_unique_all_guest_tokens_without_date';

export interface PlannedGuest {
  id: string;
  slug: string;
  notionUrl: string;
  name: string;
  role: string;
  city: string;
  bio: string;
  photoSourceRef: string | null;
  publicSocialSources: string[];
}

export interface PlannedGuestAppearance {
  guestId: string;
  episodeId: string;
  notionGuestUrl: string;
  notionEpisodeUrl: string;
  matchMethod: MatchMethod;
  youtubeAuthorName: string;
  youtubeAuthorTrust: 'owned' | 'external';
}

export interface MatchIssue {
  notionEpisodeUrl: string;
  notionEpisodeId: number | null;
  title: string;
  reason:
    | 'ambiguous'
    | 'missing_date'
    | 'missing_guest_relation'
    | 'missing_product_mapping'
    | 'missing_youtube_url'
    | 'missing_youtube_evidence'
    | 'external_author_without_strong_title_evidence'
    | 'target_collision'
    | 'unmatched';
  candidateEpisodeIds: string[];
}

export interface GuestImportPlan {
  schemaVersion: 1;
  mode: 'dry-run';
  source: 'notion-guest-library';
  guests: PlannedGuest[];
  appearances: PlannedGuestAppearance[];
  issues: MatchIssue[];
  counts: {
    notionGuests: number;
    notionPublishedEpisodeRecords: number;
    notionYoutubeEpisodeRecords: number;
    approvedYoutubeEvidenceRecords: number;
    ownedYoutubeEvidenceRecords: number;
    externalYoutubeEvidenceRecords: number;
    notionGuestRelations: number;
    supabasePublishedEpisodes: number;
    matchedEpisodeRecords: number;
    plannedGuests: number;
    plannedAppearances: number;
    matchedOwnedAuthorRecords: number;
    matchedExternalAuthorRecords: number;
    sanitizedFieldCount: number;
    duplicateNormalizedNameGroups: number;
    byMethod: Record<MatchMethod, number>;
    issues: Record<MatchIssue['reason'], number>;
  };
}

export const OWNED_YOUTUBE_AUTHORS = [
  'إذاعة مختلف',
  'ريادي مختلف',
  'مهندس مختلف',
  'Mukhtalif Podcast',
  'جنائي مختلف',
  'نفسي مختلف',
  'مسرح مختلف',
  'طيار مختلف',
  'برامج مختلف',
] as const;

/** Compatibility alias: these are the channels owned by Mukhtalif. */
export const APPROVED_YOUTUBE_AUTHORS = OWNED_YOUTUBE_AUTHORS;

export interface YouTubeEvidence {
  videoId: string;
  title: string;
  authorName: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Notion guest snapshot must contain JSON objects');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a string`);
  return value.trim();
}

function assertExactKeys(
  source: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(source).filter((key) => !allowed.has(key));
  const missing = [...allowed].filter((key) => !(key in source));
  if (unknown.length || missing.length) {
    throw new Error(
      `${label} keys do not match the privacy allowlist` +
        (unknown.length ? `; unknown: ${unknown.join(', ')}` : '') +
        (missing.length ? `; missing: ${missing.join(', ')}` : ''),
    );
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function notionPageId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'app.notion.com') return null;
    return url.pathname.match(/([a-f\d]{32})\/?$/i)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function canonicalNotionUrl(value: string): string {
  const pageId = notionPageId(value);
  if (!pageId) throw new Error(`Invalid Notion page URL: ${value}`);
  return `https://app.notion.com/${pageId}`;
}

function relationUrls(value: string | null): string[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string').map(canonicalNotionUrl);
}

export function parseSanitizedNotionSnapshot(value: unknown): SanitizedNotionSnapshot {
  const source = record(value);
  assertExactKeys(source, SNAPSHOT_KEYS, 'Snapshot');
  if (source.schemaVersion !== 2) throw new Error('Unsupported Notion guest snapshot schema');
  if (source.episodeStatusFilter !== 'نشرت') {
    throw new Error('Notion guest snapshot must prove that episode records were filtered to نشرت');
  }
  if (!Array.isArray(source.guests) || !Array.isArray(source.publishedEpisodes)) {
    throw new Error('Notion guest snapshot is missing guest or published episode arrays');
  }
  for (const item of source.guests) {
    const guest = record(item);
    assertExactKeys(guest, GUEST_KEYS, 'Guest');
  }
  for (const item of source.publishedEpisodes) {
    assertExactKeys(record(item), EPISODE_KEYS, 'Episode');
  }
  const privacy = record(source.privacy);
  const counts = record(source.counts);
  assertExactKeys(privacy, PRIVACY_KEYS, 'Privacy metadata');
  assertExactKeys(counts, COUNT_KEYS, 'Snapshot counts');
  const guests = source.guests.map((item) => {
    const guest = record(item);
    return {
      url: canonicalNotionUrl(stringValue(guest.url, 'guest.url')),
      'اسم الضيف': stringValue(guest['اسم الضيف'], 'guest name'),
      'المسمى التعريفي': nullableString(guest['المسمى التعريفي']),
      المدينة: nullableString(guest['المدينة']),
      'حسابات الضيف': nullableString(guest['حسابات الضيف']),
      'صورة الضيف': nullableString(guest['صورة الضيف']),
      'عن الضيف ': nullableString(guest['عن الضيف ']),
    } satisfies SanitizedNotionGuest;
  });
  const publishedEpisodes = source.publishedEpisodes.map((item) => {
    const episode = record(item);
    return {
      url: canonicalNotionUrl(stringValue(episode.url, 'episode.url')),
      'عنوان الصفحة': stringValue(episode['عنوان الصفحة'], 'episode title'),
      'رابط الحلقة': nullableString(episode['رابط الحلقة']),
      'date:تاريخ النشر :start': nullableString(episode['date:تاريخ النشر :start']),
      'اسم الضيف': nullableString(episode['اسم الضيف']),
      المنتج: nullableString(episode['المنتج']),
      'userDefined:ID':
        typeof episode['userDefined:ID'] === 'number' ? episode['userDefined:ID'] : null,
    } satisfies SanitizedNotionEpisode;
  });
  if (
    counts.guests !== guests.length ||
    counts.publishedEpisodeRelations !== publishedEpisodes.length
  ) {
    throw new Error('Notion guest snapshot counts do not match its arrays');
  }
  if (new Set(guests.map((guest) => guest.url)).size !== guests.length) {
    throw new Error('Notion guest snapshot contains duplicate canonical guest page IDs');
  }
  if (new Set(publishedEpisodes.map((episode) => episode.url)).size !== publishedEpisodes.length) {
    throw new Error('Notion guest snapshot contains duplicate canonical episode page IDs');
  }
  return {
    schemaVersion: 2,
    source: stringValue(source.source, 'snapshot source'),
    capturedAt: stringValue(source.capturedAt, 'snapshot capturedAt'),
    episodeStatusFilter: 'نشرت',
    privacy: {
      included: Array.isArray(privacy.included)
        ? privacy.included.filter((item): item is string => typeof item === 'string')
        : [],
      excluded: Array.isArray(privacy.excluded)
        ? privacy.excluded.filter((item): item is string => typeof item === 'string')
        : [],
    },
    counts: { guests: guests.length, publishedEpisodeRelations: publishedEpisodes.length },
    guests,
    publishedEpisodes,
  };
}

function normalizedText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0640\p{M}]/gu, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function splitSocialSources(value: string | null): string[] {
  if (!value) return [];
  // Preserve repeated tokens so the audit accounts for every source value and
  // marks duplicates explicitly instead of silently dropping them.
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function youtubeVideoId(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const isYoutube = hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
    const isShortYoutube = hostname === 'youtu.be' || hostname.endsWith('.youtu.be');
    if (!isYoutube && !isShortYoutube) return null;
    let videoId: string | null = null;
    if (isShortYoutube) {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const [kind, id] = url.pathname.split('/').filter(Boolean);
      if (['embed', 'live', 'shorts'].includes(kind ?? '')) videoId = id ?? null;
    }
    return videoId && /^[A-Za-z0-9_-]{6,32}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

function containsNormalizedPhrase(searchable: string, phrase: string): boolean {
  return Boolean(phrase) && ` ${searchable} `.includes(` ${phrase} `);
}

function normalizedTokens(value: string): string[] {
  return [...new Set(normalizedText(value).split(' ').filter(Boolean))];
}

export interface TitleEvidence {
  strong: boolean;
  exact: boolean;
  phrase: boolean;
  intersection: number;
  jaccard: number;
  containment: number;
}

export function titleEvidence(sourceTitle: string, episodeTitle: string): TitleEvidence {
  const source = normalizedText(sourceTitle);
  const target = normalizedText(episodeTitle);
  const sourceTokens = new Set(normalizedTokens(source));
  const targetTokens = new Set(normalizedTokens(target));
  const intersection = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
  const union = new Set([...sourceTokens, ...targetTokens]).size;
  const smaller = Math.min(sourceTokens.size, targetTokens.size);
  const jaccard = union ? intersection / union : 0;
  const containment = smaller ? intersection / smaller : 0;
  const exact = Boolean(source) && source === target;
  const shorterTokenCount = Math.min(sourceTokens.size, targetTokens.size);
  const shorterLength = Math.min(source.length, target.length);
  const phrase =
    shorterTokenCount >= 4 &&
    shorterLength >= 18 &&
    (containsNormalizedPhrase(source, target) || containsNormalizedPhrase(target, source));
  const strong =
    exact ||
    phrase ||
    (intersection >= 4 && jaccard >= 0.72) ||
    (intersection >= 5 && containment >= 0.85 && jaccard >= 0.55);
  return { strong, exact, phrase, intersection, jaccard, containment };
}

function meaningfulGuestTokens(name: string): string[] {
  return normalizedTokens(name).filter((token) => token.length > 1);
}

function containsAllGuestTokens(searchable: string, guestNames: string[]): boolean {
  const searchableTokens = new Set(normalizedTokens(searchable));
  return guestNames.every((name) => {
    const tokens = meaningfulGuestTokens(name);
    return tokens.length > 0 && tokens.every((token) => searchableTokens.has(token));
  });
}

function narrowCandidatesByDate(
  candidates: SupabasePublishedEpisode[],
  publishDate: string | null,
): SupabasePublishedEpisode[] {
  if (!publishDate || candidates.length <= 1) return candidates;
  const dated = candidates.filter((episode) => dateOnly(episode.publish_at) === publishDate);
  return dated.length ? dated : candidates;
}

function sanitizedEditorialField(value: string | null): { value: string; sanitized: boolean } {
  if (!value) return { value: '', sanitized: false };
  const compact = value.trim().replace(/\s+/g, ' ');
  const isErrorPlaceholder =
    /^something went wrong[.!]?(?: please)? try again[.!]?$/i.test(compact) ||
    /^حدث خطأ(?: ما)?[.!،]؟? حاول مرة أخرى[.!]؟?$/.test(compact);
  return isErrorPlaceholder ? { value: '', sanitized: true } : { value: compact, sanitized: false };
}

function stableGuestIdentity(notionUrl: string): { id: string; slug: string } {
  const pageId = notionPageId(notionUrl);
  if (!pageId) throw new Error(`Cannot derive a guest identity from ${notionUrl}`);
  return { id: `gst-notion-${pageId}`, slug: `guest-${pageId}` };
}

function issueCounts(issues: MatchIssue[]): Record<MatchIssue['reason'], number> {
  return {
    ambiguous: issues.filter((issue) => issue.reason === 'ambiguous').length,
    missing_date: issues.filter((issue) => issue.reason === 'missing_date').length,
    missing_guest_relation: issues.filter((issue) => issue.reason === 'missing_guest_relation')
      .length,
    missing_product_mapping: issues.filter((issue) => issue.reason === 'missing_product_mapping')
      .length,
    missing_youtube_url: issues.filter((issue) => issue.reason === 'missing_youtube_url').length,
    missing_youtube_evidence: issues.filter((issue) => issue.reason === 'missing_youtube_evidence')
      .length,
    external_author_without_strong_title_evidence: issues.filter(
      (issue) => issue.reason === 'external_author_without_strong_title_evidence',
    ).length,
    target_collision: issues.filter((issue) => issue.reason === 'target_collision').length,
    unmatched: issues.filter((issue) => issue.reason === 'unmatched').length,
  };
}

export function buildGuestImportPlan(
  snapshot: SanitizedNotionSnapshot,
  supabaseEpisodes: SupabasePublishedEpisode[],
  youtubeEvidenceById: ReadonlyMap<string, YouTubeEvidence>,
): GuestImportPlan {
  const guestByUrl = new Map(snapshot.guests.map((guest) => [guest.url, guest]));
  const publishedEpisodes = supabaseEpisodes.filter((episode) => episode.status === 'published');
  const provisional: Array<{
    source: SanitizedNotionEpisode;
    target: SupabasePublishedEpisode;
    guestUrls: string[];
    method: MatchMethod;
    youtubeAuthorName: string;
    youtubeAuthorTrust: 'owned' | 'external';
  }> = [];
  const issues: MatchIssue[] = [];

  for (const source of snapshot.publishedEpisodes) {
    const productUrls = relationUrls(source['المنتج']);
    const showIds = [...new Set(productUrls.map((url) => PRODUCT_TO_SHOW_ID[url]).filter(Boolean))];
    const guestUrls = [...new Set(relationUrls(source['اسم الضيف']))];
    const base = {
      notionEpisodeUrl: source.url,
      notionEpisodeId: source['userDefined:ID'],
      title: source['عنوان الصفحة'],
      candidateEpisodeIds: [] as string[],
    };
    const sourceYoutubeVideoId = youtubeVideoId(source['رابط الحلقة']);
    if (!sourceYoutubeVideoId) {
      issues.push({ ...base, reason: 'missing_youtube_url' });
      continue;
    }
    const youtubeEvidence = youtubeEvidenceById.get(sourceYoutubeVideoId);
    if (!youtubeEvidence) {
      issues.push({ ...base, reason: 'missing_youtube_evidence' });
      continue;
    }
    const youtubeAuthorTrust = (OWNED_YOUTUBE_AUTHORS as readonly string[]).includes(
      youtubeEvidence.authorName,
    )
      ? 'owned'
      : 'external';
    if (showIds.length !== 1) {
      issues.push({ ...base, reason: 'missing_product_mapping' });
      continue;
    }
    if (guestUrls.length === 0 || guestUrls.some((url) => !guestByUrl.has(url))) {
      issues.push({ ...base, reason: 'missing_guest_relation' });
      continue;
    }
    const publishDate = dateOnly(source['date:تاريخ النشر :start']);
    const candidatesInShow = publishedEpisodes.filter((episode) => episode.show_id === showIds[0]);
    let method: MatchMethod = 'exact_youtube_video';
    let candidates =
      youtubeAuthorTrust === 'owned'
        ? candidatesInShow.filter((episode) =>
            [episode.legacy_url, episode.source_url, episode.audio_url]
              .map(youtubeVideoId)
              .includes(sourceYoutubeVideoId),
          )
        : [];
    if (candidates.length === 0) {
      method = 'strong_youtube_title_evidence';
      candidates = narrowCandidatesByDate(
        candidatesInShow.filter(
          (episode) =>
            titleEvidence(youtubeEvidence.title, episode.title_ar).strong ||
            titleEvidence(youtubeEvidence.title, episode.show_notes_ar).strong,
        ),
        publishDate,
      );
    }
    if (candidates.length === 0 && youtubeAuthorTrust === 'external') {
      issues.push({
        ...base,
        reason: 'external_author_without_strong_title_evidence',
      });
      continue;
    }
    if (candidates.length === 0 && youtubeAuthorTrust === 'owned') {
      const guestNames = guestUrls.map((url) => guestByUrl.get(url)!['اسم الضيف']);
      if (publishDate) {
        method = 'show_date_all_guest_tokens';
        candidates = candidatesInShow.filter(
          (episode) =>
            dateOnly(episode.publish_at) === publishDate &&
            containsAllGuestTokens(`${episode.title_ar} ${episode.show_notes_ar}`, guestNames),
        );
      } else {
        method = 'show_unique_all_guest_tokens_without_date';
        const namesAreStrongEnough = guestNames.every(
          (name) => meaningfulGuestTokens(name).length >= 2,
        );
        candidates = namesAreStrongEnough
          ? candidatesInShow.filter((episode) =>
              containsAllGuestTokens(`${episode.title_ar} ${episode.show_notes_ar}`, guestNames),
            )
          : [];
      }
    }
    if (candidates.length === 0 && !publishDate) {
      issues.push({ ...base, reason: 'missing_date' });
      continue;
    }
    if (candidates.length !== 1) {
      issues.push({
        ...base,
        reason: candidates.length > 1 ? 'ambiguous' : 'unmatched',
        candidateEpisodeIds: candidates.map((episode) => episode.id).sort(),
      });
      continue;
    }
    provisional.push({
      source,
      target: candidates[0],
      guestUrls,
      method,
      youtubeAuthorName: youtubeEvidence.authorName,
      youtubeAuthorTrust,
    });
  }

  const sourcesByTarget = new Map<string, Set<string>>();
  for (const match of provisional) {
    const sources = sourcesByTarget.get(match.target.id) ?? new Set<string>();
    sources.add(match.source.url);
    sourcesByTarget.set(match.target.id, sources);
  }
  const collisions = new Set(
    [...sourcesByTarget.entries()]
      .filter(([, sources]) => sources.size > 1)
      .map(([episodeId]) => episodeId),
  );
  const accepted = provisional.filter((match) => {
    if (!collisions.has(match.target.id)) return true;
    issues.push({
      notionEpisodeUrl: match.source.url,
      notionEpisodeId: match.source['userDefined:ID'],
      title: match.source['عنوان الصفحة'],
      reason: 'target_collision',
      candidateEpisodeIds: [match.target.id],
    });
    return false;
  });

  const guestUrls = new Set(accepted.flatMap((match) => match.guestUrls));
  let sanitizedFieldCount = 0;
  const guests = [...guestUrls]
    .map((url) => {
      const source = guestByUrl.get(url)!;
      const identity = stableGuestIdentity(url);
      const role = sanitizedEditorialField(source['المسمى التعريفي']);
      const city = sanitizedEditorialField(source['المدينة']);
      const bio = sanitizedEditorialField(source['عن الضيف ']);
      sanitizedFieldCount +=
        Number(role.sanitized) + Number(city.sanitized) + Number(bio.sanitized);
      return {
        ...identity,
        notionUrl: url,
        name: source['اسم الضيف'],
        role: role.value,
        city: city.value,
        bio: bio.value,
        photoSourceRef: source['صورة الضيف'],
        publicSocialSources: splitSocialSources(source['حسابات الضيف']),
      } satisfies PlannedGuest;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const guestIdByUrl = new Map(guests.map((guest) => [guest.notionUrl, guest.id]));
  const appearances = accepted
    .flatMap((match) =>
      match.guestUrls.map((guestUrl) => ({
        guestId: guestIdByUrl.get(guestUrl)!,
        episodeId: match.target.id,
        notionGuestUrl: guestUrl,
        notionEpisodeUrl: match.source.url,
        matchMethod: match.method,
        youtubeAuthorName: match.youtubeAuthorName,
        youtubeAuthorTrust: match.youtubeAuthorTrust,
      })),
    )
    .filter(
      (appearance, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.guestId === appearance.guestId &&
            candidate.episodeId === appearance.episodeId,
        ) === index,
    )
    .sort((left, right) =>
      `${left.guestId}\0${left.episodeId}`.localeCompare(`${right.guestId}\0${right.episodeId}`),
    );
  const normalizedNameCounts = new Map<string, number>();
  for (const guest of guests) {
    const key = normalizedText(guest.name);
    normalizedNameCounts.set(key, (normalizedNameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNormalizedNameGroups = [...normalizedNameCounts.values()].filter(
    (count) => count > 1,
  ).length;
  const byMethod: Record<MatchMethod, number> = {
    exact_youtube_video: accepted.filter((match) => match.method === 'exact_youtube_video').length,
    strong_youtube_title_evidence: accepted.filter(
      (match) => match.method === 'strong_youtube_title_evidence',
    ).length,
    show_date_all_guest_tokens: accepted.filter(
      (match) => match.method === 'show_date_all_guest_tokens',
    ).length,
    show_unique_all_guest_tokens_without_date: accepted.filter(
      (match) => match.method === 'show_unique_all_guest_tokens_without_date',
    ).length,
  };
  const notionGuestRelations = snapshot.publishedEpisodes.reduce(
    (total, episode) => total + relationUrls(episode['اسم الضيف']).length,
    0,
  );
  return {
    schemaVersion: 1,
    mode: 'dry-run',
    source: 'notion-guest-library',
    guests,
    appearances,
    issues: issues.sort((left, right) =>
      left.notionEpisodeUrl.localeCompare(right.notionEpisodeUrl),
    ),
    counts: {
      notionGuests: snapshot.guests.length,
      notionPublishedEpisodeRecords: snapshot.publishedEpisodes.length,
      notionYoutubeEpisodeRecords: snapshot.publishedEpisodes.filter((episode) =>
        youtubeVideoId(episode['رابط الحلقة']),
      ).length,
      approvedYoutubeEvidenceRecords: snapshot.publishedEpisodes.filter((episode) => {
        const videoId = youtubeVideoId(episode['رابط الحلقة']);
        return Boolean(videoId && youtubeEvidenceById.has(videoId));
      }).length,
      ownedYoutubeEvidenceRecords: snapshot.publishedEpisodes.filter((episode) => {
        const videoId = youtubeVideoId(episode['رابط الحلقة']);
        const evidence = videoId ? youtubeEvidenceById.get(videoId) : null;
        return Boolean(
          evidence && (OWNED_YOUTUBE_AUTHORS as readonly string[]).includes(evidence.authorName),
        );
      }).length,
      externalYoutubeEvidenceRecords: snapshot.publishedEpisodes.filter((episode) => {
        const videoId = youtubeVideoId(episode['رابط الحلقة']);
        const evidence = videoId ? youtubeEvidenceById.get(videoId) : null;
        return Boolean(
          evidence && !(OWNED_YOUTUBE_AUTHORS as readonly string[]).includes(evidence.authorName),
        );
      }).length,
      notionGuestRelations,
      supabasePublishedEpisodes: publishedEpisodes.length,
      matchedEpisodeRecords: accepted.length,
      plannedGuests: guests.length,
      plannedAppearances: appearances.length,
      matchedOwnedAuthorRecords: accepted.filter((match) => match.youtubeAuthorTrust === 'owned')
        .length,
      matchedExternalAuthorRecords: accepted.filter(
        (match) => match.youtubeAuthorTrust === 'external',
      ).length,
      sanitizedFieldCount,
      duplicateNormalizedNameGroups,
      byMethod,
      issues: issueCounts(issues),
    },
  };
}
