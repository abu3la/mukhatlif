import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { GuestImportPlan, PlannedGuest } from './core.ts';

type SocialPlatform = 'x' | 'linkedin' | 'instagram' | 'youtube' | 'website';

export interface GuestDatabaseRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  city: string;
  email: string;
  bio: string;
  photo_url: string | null;
}

export interface GuestSocialDatabaseRow {
  id: string;
  guest_id: string;
  platform: SocialPlatform;
  handle: string;
}

export interface GuestAppearanceDatabaseRow {
  guest_id: string;
  episode_id: string;
}

export interface ExistingGuestData {
  guests: GuestDatabaseRow[];
  socials: GuestSocialDatabaseRow[];
  appearances: GuestAppearanceDatabaseRow[];
}

export interface ApplyDelta {
  guests: GuestDatabaseRow[];
  socials: GuestSocialDatabaseRow[];
  appearances: GuestAppearanceDatabaseRow[];
  plannedSocialCount: number;
  skippedSocialCount: number;
  socialAudit: SocialAudit;
}

export type SocialSkipReason =
  | 'not_a_single_https_url'
  | 'unsupported_profile_path'
  | 'unsafe_website_host'
  | 'handle_too_long'
  | 'duplicate_source'
  | 'platform_conflict';

export interface SocialDecision {
  guestId: string;
  source: string;
  status: 'planned' | 'skipped';
  platform?: SocialPlatform;
  handle?: string;
  reason?: SocialSkipReason;
}

export interface SocialAudit {
  sourceCount: number;
  rows: GuestSocialDatabaseRow[];
  decisions: SocialDecision[];
  conflicts: Array<{ guestId: string; platform: SocialPlatform; sources: string[] }>;
}

const RESERVED_X_PATHS = new Set(['home', 'i', 'intent', 'search', 'share']);
const RESERVED_INSTAGRAM_PATHS = new Set(['accounts', 'direct', 'explore', 'p', 'reel', 'stories']);

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function withoutTrailingSlash(pathname: string): string {
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
}

function safeSocialHandle(
  raw: string,
):
  { ok: true; platform: SocialPlatform; handle: string } | { ok: false; reason: SocialSkipReason } {
  const input = raw.trim();
  if (!input || input !== raw || /[\s,;]/.test(input)) {
    return { ok: false, reason: 'not_a_single_https_url' };
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'not_a_single_https_url' };
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return { ok: false, reason: 'not_a_single_https_url' };
  }
  url.hash = '';
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (hostMatches(hostname, 'x.com') || hostMatches(hostname, 'twitter.com')) {
    const handle = pathSegments[0] ?? '';
    if (!handle || RESERVED_X_PATHS.has(handle.toLowerCase())) {
      return { ok: false, reason: 'unsupported_profile_path' };
    }
    if (handle.length > 200) return { ok: false, reason: 'handle_too_long' };
    return { ok: true, platform: 'x', handle };
  }

  if (hostMatches(hostname, 'linkedin.com')) {
    if (!['in', 'company'].includes(pathSegments[0] ?? '') || !pathSegments[1]) {
      return { ok: false, reason: 'unsupported_profile_path' };
    }
    const handle = `${pathSegments[0]}/${pathSegments[1]}`;
    return handle.length <= 200
      ? { ok: true, platform: 'linkedin', handle }
      : { ok: false, reason: 'handle_too_long' };
  }

  if (hostMatches(hostname, 'instagram.com')) {
    const handle = pathSegments[0] ?? '';
    if (!handle || RESERVED_INSTAGRAM_PATHS.has(handle.toLowerCase())) {
      return { ok: false, reason: 'unsupported_profile_path' };
    }
    if (handle.length > 200) return { ok: false, reason: 'handle_too_long' };
    return { ok: true, platform: 'instagram', handle };
  }

  if (hostMatches(hostname, 'youtube.com') || hostMatches(hostname, 'youtu.be')) {
    let handle = '';
    if (hostMatches(hostname, 'youtu.be')) {
      const videoId = pathSegments[0];
      if (videoId && /^[A-Za-z0-9_-]{6,32}$/.test(videoId)) handle = `watch?v=${videoId}`;
    } else if (url.pathname === '/watch') {
      const videoId = url.searchParams.get('v');
      if (videoId && /^[A-Za-z0-9_-]{6,32}$/.test(videoId)) handle = `watch?v=${videoId}`;
    } else if (
      pathSegments[0]?.startsWith('@') ||
      ['c', 'channel', 'user'].includes(pathSegments[0] ?? '')
    ) {
      handle = withoutTrailingSlash(url.pathname).replace(/^\/+/, '');
    }
    if (!handle) return { ok: false, reason: 'unsupported_profile_path' };
    return handle.length <= 200
      ? { ok: true, platform: 'youtube', handle }
      : { ok: false, reason: 'handle_too_long' };
  }

  const isPublicHostname =
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    isIP(hostname) === 0 &&
    hostname.includes('.');
  if (!isPublicHostname) return { ok: false, reason: 'unsafe_website_host' };
  url.hostname = hostname;
  url.pathname = withoutTrailingSlash(url.pathname);
  const handle = url.toString();
  return handle.length <= 200
    ? { ok: true, platform: 'website', handle }
    : { ok: false, reason: 'handle_too_long' };
}

function stableSocialId(guestId: string, platform: SocialPlatform, handle: string): string {
  const hash = createHash('sha256')
    .update(`notion-guest-social\0${guestId}\0${platform}\0${handle}`)
    .digest('hex')
    .slice(0, 20);
  return `gsoc-notion-${hash}`;
}

function guestRow(guest: PlannedGuest): GuestDatabaseRow {
  return {
    id: guest.id,
    slug: guest.slug,
    name: guest.name,
    role: guest.role,
    city: guest.city,
    email: '',
    bio: guest.bio,
    photo_url: null,
  };
}

function assertGuestLimits(row: GuestDatabaseRow): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) {
    throw new Error(`Plan contains an invalid guest slug: ${row.slug}`);
  }
  const limits: Array<[string, string, number]> = [
    ['name', row.name, 160],
    ['role', row.role, 160],
    ['city', row.city, 120],
    ['bio', row.bio, 4000],
  ];
  for (const [field, value, maximum] of limits) {
    if (value.length > maximum) {
      throw new Error(`Plan guest ${row.id} exceeds the ${field} database limit`);
    }
  }
}

function sameControlledGuest(left: GuestDatabaseRow, right: GuestDatabaseRow): boolean {
  return (
    left.id === right.id &&
    left.slug === right.slug &&
    left.name === right.name &&
    left.role === right.role &&
    left.city === right.city &&
    left.email === right.email &&
    left.bio === right.bio &&
    left.photo_url === right.photo_url
  );
}

function pairKey(guestId: string, episodeId: string): string {
  return `${guestId}\0${episodeId}`;
}

function socialKey(guestId: string, platform: SocialPlatform): string {
  return `${guestId}\0${platform}`;
}

export function auditSocialSources(guests: PlannedGuest[]): SocialAudit {
  const rows: GuestSocialDatabaseRow[] = [];
  const decisions: SocialDecision[] = [];
  const conflicts: SocialAudit['conflicts'] = [];
  for (const guest of guests) {
    const parsedSources = guest.publicSocialSources.map((source) => ({
      source,
      parsed: safeSocialHandle(source),
    }));
    for (const candidate of parsedSources) {
      if (!candidate.parsed.ok) {
        decisions.push({
          guestId: guest.id,
          source: candidate.source,
          status: 'skipped',
          reason: candidate.parsed.reason,
        });
      }
    }
    const valid = parsedSources.filter(
      (
        candidate,
      ): candidate is {
        source: string;
        parsed: { ok: true; platform: SocialPlatform; handle: string };
      } => candidate.parsed.ok,
    );
    for (const platform of ['x', 'linkedin', 'instagram', 'youtube', 'website'] as const) {
      const candidates = valid.filter((candidate) => candidate.parsed.platform === platform);
      const handles = [...new Set(candidates.map((candidate) => candidate.parsed.handle))];
      if (handles.length > 1) {
        conflicts.push({
          guestId: guest.id,
          platform,
          sources: candidates.map(({ source }) => source),
        });
        decisions.push(
          ...candidates.map(({ source, parsed }) => ({
            guestId: guest.id,
            source,
            status: 'skipped' as const,
            platform,
            handle: parsed.handle,
            reason: 'platform_conflict' as const,
          })),
        );
        continue;
      }
      if (handles.length === 0) continue;
      const handle = handles[0];
      rows.push({
        id: stableSocialId(guest.id, platform, handle),
        guest_id: guest.id,
        platform,
        handle,
      });
      let planned = false;
      for (const candidate of candidates) {
        decisions.push({
          guestId: guest.id,
          source: candidate.source,
          status: planned ? 'skipped' : 'planned',
          platform,
          handle,
          ...(planned ? { reason: 'duplicate_source' as const } : {}),
        });
        planned = true;
      }
    }
  }
  return {
    sourceCount: guests.reduce((total, guest) => total + guest.publicSocialSources.length, 0),
    rows: rows.sort((a, b) => a.id.localeCompare(b.id)),
    decisions: decisions.sort((a, b) =>
      `${a.guestId}\0${a.source}`.localeCompare(`${b.guestId}\0${b.source}`),
    ),
    conflicts,
  };
}

export function computeApplyDelta(plan: GuestImportPlan, existing: ExistingGuestData): ApplyDelta {
  const plannedGuests = plan.guests.map(guestRow).sort((a, b) => a.id.localeCompare(b.id));
  for (const row of plannedGuests) assertGuestLimits(row);

  const plannedGuestIds = new Set<string>();
  const plannedSlugs = new Set<string>();
  for (const row of plannedGuests) {
    if (plannedGuestIds.has(row.id) || plannedSlugs.has(row.slug)) {
      throw new Error('Plan contains duplicate guest IDs or slugs');
    }
    plannedGuestIds.add(row.id);
    plannedSlugs.add(row.slug);
  }

  const existingById = new Map(existing.guests.map((row) => [row.id, row]));
  const existingBySlug = new Map(existing.guests.map((row) => [row.slug, row]));
  const guests = plannedGuests.filter((planned) => {
    const byId = existingById.get(planned.id);
    const bySlug = existingBySlug.get(planned.slug);
    if (!byId && !bySlug) return true;
    if (!byId || !bySlug || byId !== bySlug || !sameControlledGuest(planned, byId)) {
      throw new Error(
        `Unexpected existing guest ID or slug conflict: ${planned.id}/${planned.slug}`,
      );
    }
    return false;
  });

  const socialPlan = auditSocialSources(plan.guests);
  // A platform conflict defers that platform only. The audit emits no row for
  // it, so guest and appearance import can proceed without guessing a link.
  const existingSocialById = new Map(existing.socials.map((row) => [row.id, row]));
  const existingSocialByPair = new Map(
    existing.socials.map((row) => [socialKey(row.guest_id, row.platform), row]),
  );
  const plannedSocialPairs = new Set(
    socialPlan.rows.map((row) => socialKey(row.guest_id, row.platform)),
  );
  for (const row of existing.socials) {
    if (
      plannedGuestIds.has(row.guest_id) &&
      !plannedSocialPairs.has(socialKey(row.guest_id, row.platform))
    ) {
      throw new Error(`Unexpected stale social for planned guest: ${row.guest_id}`);
    }
  }
  const socials = socialPlan.rows.filter((planned) => {
    const byId = existingSocialById.get(planned.id);
    const byPair = existingSocialByPair.get(socialKey(planned.guest_id, planned.platform));
    if (!byId && !byPair) return true;
    if (
      !byId ||
      !byPair ||
      byId !== byPair ||
      byId.guest_id !== planned.guest_id ||
      byId.platform !== planned.platform ||
      byId.handle !== planned.handle
    ) {
      throw new Error(`Unexpected existing guest social conflict: ${planned.guest_id}`);
    }
    return false;
  });

  const plannedAppearanceRows = plan.appearances
    .map((appearance) => ({
      guest_id: appearance.guestId,
      episode_id: appearance.episodeId,
    }))
    .sort((a, b) =>
      pairKey(a.guest_id, a.episode_id).localeCompare(pairKey(b.guest_id, b.episode_id)),
    );
  const plannedAppearanceKeys = new Set(
    plannedAppearanceRows.map((row) => pairKey(row.guest_id, row.episode_id)),
  );
  if (plannedAppearanceKeys.size !== plannedAppearanceRows.length) {
    throw new Error('Plan contains duplicate guest appearance pairs');
  }
  for (const row of existing.appearances) {
    if (
      plannedGuestIds.has(row.guest_id) &&
      !plannedAppearanceKeys.has(pairKey(row.guest_id, row.episode_id))
    ) {
      throw new Error(`Unexpected existing appearance for planned guest: ${row.guest_id}`);
    }
  }
  const existingAppearanceKeys = new Set(
    existing.appearances.map((row) => pairKey(row.guest_id, row.episode_id)),
  );
  const appearances = plannedAppearanceRows.filter(
    (row) => !existingAppearanceKeys.has(pairKey(row.guest_id, row.episode_id)),
  );

  return {
    guests,
    socials,
    appearances,
    plannedSocialCount: socialPlan.rows.length,
    skippedSocialCount: socialPlan.decisions.filter((decision) => decision.status === 'skipped')
      .length,
    socialAudit: socialPlan,
  };
}

export function assertPlanApplied(plan: GuestImportPlan, existing: ExistingGuestData): void {
  const remaining = computeApplyDelta(plan, existing);
  if (remaining.guests.length || remaining.socials.length || remaining.appearances.length) {
    throw new Error('Post-apply verification found missing planned rows');
  }
}
