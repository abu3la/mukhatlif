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
import type {
  CreateArticleInput,
  CreateEpisodeInput,
  CreateShowInput,
  UpdateArticleInput,
  UpdateEpisodeInput,
  UpdateShowInput,
} from '@mukhtalif/validation';
import type { ArticleFilter, EpisodeFilter, Repository } from './types';

/**
 * Seeded development dataset mirroring supabase/migrations/0001_init.sql.
 * Module-level state persists only per Worker isolate — good enough for
 * local development. Audio URLs are royalty-free placeholder tracks so the
 * player is exercisable before R2 is provisioned.
 */

const users: User[] = [
  {
    id: 'usr-admin-1',
    email: 'studio@mukhtalif.net',
    displayName: 'فريق مختلف',
    role: 'admin',
    locale: 'ar',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: 'usr-listener-1',
    email: 'sara@example.com',
    displayName: 'سارة الحربي',
    role: 'listener',
    locale: 'ar',
    createdAt: '2026-02-02T10:30:00Z',
  },
  {
    id: 'usr-listener-2',
    email: 'khalid@example.com',
    displayName: 'خالد العتيبي',
    role: 'listener',
    locale: 'ar',
    createdAt: '2026-03-15T14:12:00Z',
  },
];

const shows: Show[] = [
  {
    id: 'shw-petroly',
    slug: 'petroly',
    titleAr: 'بترولي',
    titleEn: 'Petroly',
    descriptionAr: 'لقاءات مع مهنيين ملهمين يشاركون تجاربهم في مسيرتهم المهنية.',
    hostName: 'أحمد العطار',
    category: 'مسيرة مهنية',
    premium: false,
    createdAt: '2026-01-12T08:00:00Z',
  },
  {
    id: 'shw-gilaf',
    slug: 'gilaf',
    titleAr: 'غلاف',
    titleEn: 'Gilaf',
    descriptionAr: 'كتب أجنبية نناقشها ونسقطها على واقعنا العربي.',
    hostName: 'محمد المرشدي',
    category: 'كتب',
    premium: false,
    createdAt: '2026-01-12T08:05:00Z',
  },
  {
    id: 'shw-shaqla',
    slug: 'shaqla',
    titleAr: 'شقلة',
    titleEn: 'Shaqla',
    descriptionAr: 'نغوص في تفاصيل المهن مع مختصين يعيشونها يوميًا.',
    hostName: 'عبدالله إسحاق',
    category: 'مهن',
    premium: false,
    createdAt: '2026-01-12T08:10:00Z',
  },
  {
    id: 'shw-partition',
    slug: 'partition',
    titleAr: 'بارتشن',
    titleEn: 'Partition',
    descriptionAr: 'قضايا بيئة العمل من منظور الجنسين في حوار مفتوح.',
    hostName: 'أحمد حسن مشرف',
    category: 'بيئة عمل',
    premium: false,
    createdAt: '2026-01-12T08:15:00Z',
  },
  {
    id: 'shw-seera',
    slug: 'seera',
    titleAr: 'سيرة',
    titleEn: 'Seera',
    descriptionAr: 'سير مهنية تُروى من أصحابها، بتفاصيلها الصعبة قبل الجميلة.',
    hostName: 'فريق مختلف',
    category: 'سير',
    premium: true,
    createdAt: '2026-01-20T08:00:00Z',
  },
];

const episodes: Episode[] = [
  {
    id: 'ep-1001',
    showId: 'shw-petroly',
    titleAr: 'من الحقل إلى الإدارة: رحلة مهندس',
    showNotesAr: 'ضيف الحلقة يشارك تحولات مسيرته من مواقع الحفر إلى قيادة الفرق.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    durationSec: 2520,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-06-04T05:00:00Z',
    createdAt: '2026-06-01T09:00:00Z',
  },
  {
    id: 'ep-1002',
    showId: 'shw-petroly',
    titleAr: 'أول وظيفة في قطاع الطاقة',
    showNotesAr: 'كيف تقرأ عرض العمل الأول، وما الذي يستحق التفاوض عليه.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    durationSec: 1980,
    episodeNumber: 2,
    premium: false,
    status: 'published',
    publishAt: '2026-06-18T05:00:00Z',
    createdAt: '2026-06-15T09:00:00Z',
  },
  {
    id: 'ep-2001',
    showId: 'shw-gilaf',
    titleAr: 'عادات ذرية: هل تصمد في بيئة عربية؟',
    showNotesAr: 'نقرأ الكتاب الأشهر في الإنتاجية ونسأل: ما الذي يترجم فعلًا؟',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    durationSec: 3120,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-06-25T05:00:00Z',
    createdAt: '2026-06-20T09:00:00Z',
  },
  {
    id: 'ep-3001',
    showId: 'shw-shaqla',
    titleAr: 'يوم في حياة مراقب جوي',
    showNotesAr: 'مهنة لا تحتمل الخطأ: كيف تُدار السماء من برج المراقبة.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    durationSec: 2760,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-07-02T05:00:00Z',
    createdAt: '2026-06-28T09:00:00Z',
  },
  {
    id: 'ep-4001',
    showId: 'shw-partition',
    titleAr: 'الترقية الأولى: من يطلبها ومن ينتظرها؟',
    showNotesAr: 'حوار مفتوح حول الفروق في طلب الترقيات والمبادرة داخل الفريق.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    durationSec: 2340,
    episodeNumber: 1,
    premium: false,
    status: 'published',
    publishAt: '2026-07-09T05:00:00Z',
    createdAt: '2026-07-05T09:00:00Z',
  },
  {
    id: 'ep-5001',
    showId: 'shw-seera',
    titleAr: 'سيرة: من التقاعد المبكر إلى تأسيس شركة',
    showNotesAr: 'حلقة حصرية للمشتركين: قصة كاملة من القرار الصعب إلى أول عميل.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    durationSec: 3600,
    episodeNumber: 1,
    premium: true,
    status: 'published',
    publishAt: '2026-07-16T05:00:00Z',
    createdAt: '2026-07-10T09:00:00Z',
  },
  {
    id: 'ep-1003',
    showId: 'shw-petroly',
    titleAr: 'الانتقال بين الشركات الكبرى',
    showNotesAr: 'مسودة قيد التحرير.',
    durationSec: 0,
    episodeNumber: 3,
    premium: false,
    status: 'draft',
    createdAt: '2026-08-01T09:00:00Z',
  },
  {
    id: 'ep-2002',
    showId: 'shw-gilaf',
    titleAr: 'كيف تقرأ سيرة ذاتية؟ الكتاب خلف التوظيف',
    showNotesAr: 'مجدولة للأسبوع القادم.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    durationSec: 2880,
    episodeNumber: 2,
    premium: false,
    status: 'scheduled',
    publishAt: '2026-08-20T05:00:00Z',
    createdAt: '2026-08-05T09:00:00Z',
  },
  {
    id: 'ep-3002',
    showId: 'shw-shaqla',
    titleAr: 'الحلقة التجريبية الأولى',
    showNotesAr: 'أرشيف الموسم صفر.',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    durationSec: 1500,
    episodeNumber: 0,
    premium: false,
    status: 'archived',
    publishAt: '2026-02-01T05:00:00Z',
    createdAt: '2026-01-28T09:00:00Z',
  },
];

const articles: Article[] = [
  {
    id: 'art-1',
    slug: 'first-90-days',
    titleAr: 'أول ٩٠ يومًا في وظيفتك الجديدة',
    bodyAr:
      'الأشهر الثلاثة الأولى تحدد صورتك المهنية لسنوات. في هذا المقال نلخص ما ينصح به ضيوف مختلف: افهم قبل أن تقترح، وابنِ علاقات قبل أن تحتاجها، ووثّق أثرك من الأسبوع الأول.',
    status: 'published',
    publishedAt: '2026-07-20T08:00:00Z',
    createdAt: '2026-07-18T08:00:00Z',
  },
  {
    id: 'art-2',
    slug: 'salary-negotiation',
    titleAr: 'التفاوض على الراتب: دليل عملي',
    bodyAr: 'مسودة قيد المراجعة التحريرية.',
    status: 'draft',
    createdAt: '2026-08-03T08:00:00Z',
  },
];

const plans: Plan[] = [
  {
    id: 'pln-plus',
    nameAr: 'مختلف بلس',
    nameEn: 'Mukhtalif Plus',
    priceMinor: 1900,
    currency: 'SAR',
    interval: 'month',
  },
];

const subscriptions: Subscription[] = [
  {
    id: 'sub-1001',
    userId: 'usr-listener-1',
    planId: 'pln-plus',
    status: 'active',
    priceMinor: 1900,
    currency: 'SAR',
    currentPeriodEnd: '2026-09-01T00:00:00Z',
    createdAt: '2026-06-01T00:00:00Z',
  },
];

const follows: Follow[] = [
  { userId: 'usr-listener-1', showId: 'shw-petroly', createdAt: '2026-06-05T10:00:00Z' },
  { userId: 'usr-listener-1', showId: 'shw-seera', createdAt: '2026-07-16T10:00:00Z' },
];

const progress: PlaybackProgress[] = [
  {
    userId: 'usr-listener-1',
    episodeId: 'ep-1001',
    positionSec: 1130,
    updatedAt: '2026-08-06T21:14:00Z',
  },
];

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createMemoryRepository(): Repository {
  return {
    async getUser(userId) {
      return users.find((u) => u.id === userId) ?? null;
    },
    async getUserByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async listUsers() {
      return [...users];
    },

    async listShows() {
      return [...shows];
    },
    async getShow(showId) {
      return shows.find((s) => s.id === showId) ?? null;
    },
    async getShowBySlug(slug) {
      return shows.find((s) => s.slug === slug) ?? null;
    },
    async createShow(input: CreateShowInput) {
      const show: Show = { id: id('shw'), createdAt: new Date().toISOString(), ...input };
      shows.push(show);
      return show;
    },
    async updateShow(showId, input: UpdateShowInput) {
      const show = shows.find((s) => s.id === showId);
      if (!show) return null;
      Object.assign(show, input);
      return show;
    },

    async listEpisodes(filter: EpisodeFilter) {
      return episodes
        .filter((e) => (filter.showId ? e.showId === filter.showId : true))
        .filter((e) => (filter.status ? e.status === filter.status : true))
        .sort((a, b) => (b.publishAt ?? b.createdAt).localeCompare(a.publishAt ?? a.createdAt));
    },
    async getEpisode(episodeId) {
      return episodes.find((e) => e.id === episodeId) ?? null;
    },
    async createEpisode(input: CreateEpisodeInput) {
      const episode: Episode = {
        id: id('ep'),
        status: 'draft',
        createdAt: new Date().toISOString(),
        ...input,
      };
      episodes.push(episode);
      return episode;
    },
    async updateEpisode(episodeId, input: UpdateEpisodeInput) {
      const episode = episodes.find((e) => e.id === episodeId);
      if (!episode) return null;
      Object.assign(episode, input);
      return episode;
    },
    async updateEpisodeStatus(episodeId, status: EpisodeStatus, publishAt?: string) {
      const episode = episodes.find((e) => e.id === episodeId);
      if (!episode) return null;
      episode.status = status;
      if (publishAt !== undefined) episode.publishAt = publishAt;
      return episode;
    },
    async setEpisodeAudioKey(episodeId, audioKey) {
      const episode = episodes.find((e) => e.id === episodeId);
      if (!episode) return null;
      episode.audioKey = audioKey;
      return episode;
    },

    async listArticles(filter: ArticleFilter) {
      return articles
        .filter((a) => (filter.status ? a.status === filter.status : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getArticle(articleId) {
      return articles.find((a) => a.id === articleId) ?? null;
    },
    async getArticleBySlug(slug) {
      return articles.find((a) => a.slug === slug) ?? null;
    },
    async createArticle(input: CreateArticleInput) {
      const article: Article = {
        id: id('art'),
        status: 'draft',
        createdAt: new Date().toISOString(),
        ...input,
      };
      articles.push(article);
      return article;
    },
    async updateArticle(articleId, input: UpdateArticleInput) {
      const article = articles.find((a) => a.id === articleId);
      if (!article) return null;
      Object.assign(article, input);
      return article;
    },
    async updateArticleStatus(articleId, status: ArticleStatus, publishedAt?: string) {
      const article = articles.find((a) => a.id === articleId);
      if (!article) return null;
      article.status = status;
      if (publishedAt !== undefined) article.publishedAt = publishedAt;
      return article;
    },

    async listPlans() {
      return [...plans];
    },
    async getPlan(planId) {
      return plans.find((p) => p.id === planId) ?? null;
    },

    async listSubscriptions() {
      return [...subscriptions];
    },
    async getSubscriptionForUser(userId) {
      return subscriptions.find((s) => s.userId === userId && s.status !== 'canceled') ?? null;
    },
    async getSubscription(subscriptionId) {
      return subscriptions.find((s) => s.id === subscriptionId) ?? null;
    },
    async createSubscription(input, priceMinor, currency, currentPeriodEnd) {
      const subscription: Subscription = {
        id: id('sub'),
        userId: input.userId,
        planId: input.planId,
        status: 'active',
        priceMinor,
        currency,
        currentPeriodEnd,
        createdAt: new Date().toISOString(),
      };
      subscriptions.push(subscription);
      return subscription;
    },
    async updateSubscriptionStatus(subscriptionId, status: SubscriptionStatus) {
      const subscription = subscriptions.find((s) => s.id === subscriptionId);
      if (!subscription) return null;
      subscription.status = status;
      return subscription;
    },

    async listFollows(userId) {
      return follows.filter((f) => f.userId === userId);
    },
    async createFollow(userId, showId) {
      const existing = follows.find((f) => f.userId === userId && f.showId === showId);
      if (existing) return existing;
      const follow: Follow = { userId, showId, createdAt: new Date().toISOString() };
      follows.push(follow);
      return follow;
    },
    async deleteFollow(userId, showId) {
      const index = follows.findIndex((f) => f.userId === userId && f.showId === showId);
      if (index === -1) return false;
      follows.splice(index, 1);
      return true;
    },

    async listProgress(userId) {
      return progress.filter((p) => p.userId === userId);
    },
    async upsertProgress(userId, episodeId, positionSec) {
      const existing = progress.find((p) => p.userId === userId && p.episodeId === episodeId);
      if (existing) {
        existing.positionSec = positionSec;
        existing.updatedAt = new Date().toISOString();
        return existing;
      }
      const entry: PlaybackProgress = {
        userId,
        episodeId,
        positionSec,
        updatedAt: new Date().toISOString(),
      };
      progress.push(entry);
      return entry;
    },
  };
}
