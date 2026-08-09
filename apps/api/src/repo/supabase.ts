import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Article,
  ArticleStatus,
  Episode,
  EpisodeStatus,
  Follow,
  Plan,
  PlaybackProgress,
  Show,
  Subscription,
  SubscriptionStatus,
  User,
} from '@mukhtalif/types';
import type { Repository } from './types';

/** snake_case rows in Postgres ↔ camelCase domain objects. */

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: User['role'];
  locale: User['locale'];
  created_at: string;
}

interface ShowRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string;
  description_en: string | null;
  host_name: string;
  artwork_url: string | null;
  category: string;
  premium: boolean;
  created_at: string;
}

interface EpisodeRow {
  id: string;
  show_id: string;
  title_ar: string;
  title_en: string | null;
  show_notes_ar: string;
  show_notes_en: string | null;
  audio_key: string | null;
  audio_url: string | null;
  duration_sec: number;
  episode_number: number;
  premium: boolean;
  status: EpisodeStatus;
  publish_at: string | null;
  created_at: string;
}

interface ArticleRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  body_ar: string;
  cover_url: string | null;
  status: ArticleStatus;
  published_at: string | null;
  created_at: string;
}

interface PlanRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  price_minor: number;
  currency: string;
  interval: Plan['interval'];
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  price_minor: number;
  currency: string;
  current_period_end: string;
  created_at: string;
}

interface FollowRow {
  user_id: string;
  show_id: string;
  created_at: string;
}

interface ProgressRow {
  user_id: string;
  episode_id: string;
  position_sec: number;
  updated_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    locale: row.locale,
    createdAt: row.created_at,
  };
}

function toShow(row: ShowRow): Show {
  return {
    id: row.id,
    slug: row.slug,
    titleAr: row.title_ar,
    titleEn: row.title_en ?? undefined,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en ?? undefined,
    hostName: row.host_name,
    artworkUrl: row.artwork_url ?? undefined,
    category: row.category,
    premium: row.premium,
    createdAt: row.created_at,
  };
}

function toEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    showId: row.show_id,
    titleAr: row.title_ar,
    titleEn: row.title_en ?? undefined,
    showNotesAr: row.show_notes_ar,
    showNotesEn: row.show_notes_en ?? undefined,
    audioKey: row.audio_key ?? undefined,
    audioUrl: row.audio_url ?? undefined,
    durationSec: row.duration_sec,
    episodeNumber: row.episode_number,
    premium: row.premium,
    status: row.status,
    publishAt: row.publish_at ?? undefined,
    createdAt: row.created_at,
  };
}

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    slug: row.slug,
    titleAr: row.title_ar,
    titleEn: row.title_en ?? undefined,
    bodyAr: row.body_ar,
    coverUrl: row.cover_url ?? undefined,
    status: row.status,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
  };
}

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? undefined,
    priceMinor: row.price_minor,
    currency: row.currency,
    interval: row.interval,
  };
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    priceMinor: row.price_minor,
    currency: row.currency,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  };
}

function toFollow(row: FollowRow): Follow {
  return { userId: row.user_id, showId: row.show_id, createdAt: row.created_at };
}

function toProgress(row: ProgressRow): PlaybackProgress {
  return {
    userId: row.user_id,
    episodeId: row.episode_id,
    positionSec: row.position_sec,
    updatedAt: row.updated_at,
  };
}

function throwOn(error: { message: string } | null): void {
  if (error) throw new Error(`supabase: ${error.message}`);
}

function showPatch(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    slug: 'slug',
    titleAr: 'title_ar',
    titleEn: 'title_en',
    descriptionAr: 'description_ar',
    descriptionEn: 'description_en',
    hostName: 'host_name',
    artworkUrl: 'artwork_url',
    category: 'category',
    premium: 'premium',
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) patch[map[key]] = value;
  }
  return patch;
}

function episodePatch(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    showId: 'show_id',
    titleAr: 'title_ar',
    titleEn: 'title_en',
    showNotesAr: 'show_notes_ar',
    showNotesEn: 'show_notes_en',
    audioUrl: 'audio_url',
    durationSec: 'duration_sec',
    episodeNumber: 'episode_number',
    premium: 'premium',
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) patch[map[key]] = value;
  }
  return patch;
}

function articlePatch(input: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    slug: 'slug',
    titleAr: 'title_ar',
    titleEn: 'title_en',
    bodyAr: 'body_ar',
    coverUrl: 'cover_url',
  };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && map[key]) patch[map[key]] = value;
  }
  return patch;
}

export function createSupabaseRepository(url: string, serviceRoleKey: string): Repository {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  async function single<Row, Out>(
    query: PromiseLike<{ data: Row | null; error: { message: string } | null }>,
    map: (row: Row) => Out,
  ): Promise<Out | null> {
    const { data, error } = await query;
    if (error && !error.message.includes('0 rows')) throwOn(error);
    return data ? map(data) : null;
  }

  return {
    async getUser(id) {
      return single<UserRow, User>(
        db.from('users').select('*').eq('id', id).maybeSingle(),
        toUser,
      );
    },
    async getUserByEmail(email) {
      return single<UserRow, User>(
        db.from('users').select('*').eq('email', email).maybeSingle(),
        toUser,
      );
    },
    async listUsers() {
      const { data, error } = await db.from('users').select('*').order('created_at');
      throwOn(error);
      return ((data ?? []) as UserRow[]).map(toUser);
    },

    async listShows() {
      const { data, error } = await db.from('shows').select('*').order('created_at');
      throwOn(error);
      return ((data ?? []) as ShowRow[]).map(toShow);
    },
    async getShow(id) {
      return single<ShowRow, Show>(
        db.from('shows').select('*').eq('id', id).maybeSingle(),
        toShow,
      );
    },
    async getShowBySlug(slug) {
      return single<ShowRow, Show>(
        db.from('shows').select('*').eq('slug', slug).maybeSingle(),
        toShow,
      );
    },
    async createShow(input) {
      const { data, error } = await db
        .from('shows')
        .insert(showPatch(input))
        .select()
        .single();
      throwOn(error);
      return toShow(data as ShowRow);
    },
    async updateShow(id, input) {
      return single<ShowRow, Show>(
        db.from('shows').update(showPatch(input)).eq('id', id).select().maybeSingle(),
        toShow,
      );
    },

    async listEpisodes(filter) {
      let query = db.from('episodes').select('*');
      if (filter.showId) query = query.eq('show_id', filter.showId);
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query.order('publish_at', {
        ascending: false,
        nullsFirst: false,
      });
      throwOn(error);
      return ((data ?? []) as EpisodeRow[]).map(toEpisode);
    },
    async getEpisode(id) {
      return single<EpisodeRow, Episode>(
        db.from('episodes').select('*').eq('id', id).maybeSingle(),
        toEpisode,
      );
    },
    async createEpisode(input) {
      const { data, error } = await db
        .from('episodes')
        .insert({ ...episodePatch(input), status: 'draft' })
        .select()
        .single();
      throwOn(error);
      return toEpisode(data as EpisodeRow);
    },
    async updateEpisode(id, input) {
      return single<EpisodeRow, Episode>(
        db.from('episodes').update(episodePatch(input)).eq('id', id).select().maybeSingle(),
        toEpisode,
      );
    },
    async updateEpisodeStatus(id, status, publishAt) {
      const patch: Record<string, unknown> = { status };
      if (publishAt !== undefined) patch.publish_at = publishAt;
      return single<EpisodeRow, Episode>(
        db.from('episodes').update(patch).eq('id', id).select().maybeSingle(),
        toEpisode,
      );
    },
    async setEpisodeAudioKey(id, audioKey) {
      return single<EpisodeRow, Episode>(
        db.from('episodes').update({ audio_key: audioKey }).eq('id', id).select().maybeSingle(),
        toEpisode,
      );
    },

    async listArticles(filter) {
      let query = db.from('articles').select('*');
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query.order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as ArticleRow[]).map(toArticle);
    },
    async getArticle(id) {
      return single<ArticleRow, Article>(
        db.from('articles').select('*').eq('id', id).maybeSingle(),
        toArticle,
      );
    },
    async getArticleBySlug(slug) {
      return single<ArticleRow, Article>(
        db.from('articles').select('*').eq('slug', slug).maybeSingle(),
        toArticle,
      );
    },
    async createArticle(input) {
      const { data, error } = await db
        .from('articles')
        .insert({ ...articlePatch(input), status: 'draft' })
        .select()
        .single();
      throwOn(error);
      return toArticle(data as ArticleRow);
    },
    async updateArticle(id, input) {
      return single<ArticleRow, Article>(
        db.from('articles').update(articlePatch(input)).eq('id', id).select().maybeSingle(),
        toArticle,
      );
    },
    async updateArticleStatus(id, status, publishedAt) {
      const patch: Record<string, unknown> = { status };
      if (publishedAt !== undefined) patch.published_at = publishedAt;
      return single<ArticleRow, Article>(
        db.from('articles').update(patch).eq('id', id).select().maybeSingle(),
        toArticle,
      );
    },

    async listPlans() {
      const { data, error } = await db.from('plans').select('*').order('price_minor');
      throwOn(error);
      return ((data ?? []) as PlanRow[]).map(toPlan);
    },
    async getPlan(id) {
      return single<PlanRow, Plan>(
        db.from('plans').select('*').eq('id', id).maybeSingle(),
        toPlan,
      );
    },

    async listSubscriptions() {
      const { data, error } = await db
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      throwOn(error);
      return ((data ?? []) as SubscriptionRow[]).map(toSubscription);
    },
    async getSubscriptionForUser(userId) {
      return single<SubscriptionRow, Subscription>(
        db
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .neq('status', 'canceled')
          .maybeSingle(),
        toSubscription,
      );
    },
    async getSubscription(id) {
      return single<SubscriptionRow, Subscription>(
        db.from('subscriptions').select('*').eq('id', id).maybeSingle(),
        toSubscription,
      );
    },
    async createSubscription(input, priceMinor, currency, currentPeriodEnd) {
      const { data, error } = await db
        .from('subscriptions')
        .insert({
          user_id: input.userId,
          plan_id: input.planId,
          status: 'active',
          price_minor: priceMinor,
          currency,
          current_period_end: currentPeriodEnd,
        })
        .select()
        .single();
      throwOn(error);
      return toSubscription(data as SubscriptionRow);
    },
    async updateSubscriptionStatus(id, status) {
      return single<SubscriptionRow, Subscription>(
        db.from('subscriptions').update({ status }).eq('id', id).select().maybeSingle(),
        toSubscription,
      );
    },

    async listFollows(userId) {
      const { data, error } = await db.from('follows').select('*').eq('user_id', userId);
      throwOn(error);
      return ((data ?? []) as FollowRow[]).map(toFollow);
    },
    async createFollow(userId, showId) {
      const { data, error } = await db
        .from('follows')
        .upsert({ user_id: userId, show_id: showId })
        .select()
        .single();
      throwOn(error);
      return toFollow(data as FollowRow);
    },
    async deleteFollow(userId, showId) {
      const { error, count } = await db
        .from('follows')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .eq('show_id', showId);
      throwOn(error);
      return (count ?? 0) > 0;
    },

    async listProgress(userId) {
      const { data, error } = await db
        .from('playback_progress')
        .select('*')
        .eq('user_id', userId);
      throwOn(error);
      return ((data ?? []) as ProgressRow[]).map(toProgress);
    },
    async upsertProgress(userId, episodeId, positionSec) {
      const { data, error } = await db
        .from('playback_progress')
        .upsert({
          user_id: userId,
          episode_id: episodeId,
          position_sec: positionSec,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      throwOn(error);
      return toProgress(data as ProgressRow);
    },
  };
}
