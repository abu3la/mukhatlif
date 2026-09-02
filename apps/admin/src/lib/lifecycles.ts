import { canTransitionEpisode as canTransitionApiEpisode } from '@mukhtalif/types';
import type {
  Article,
  ArticleStatus,
  Episode,
  EpisodeStatus,
  IsoDateTime,
  PlusPlan,
  Subscription,
  SubscriptionId,
  SubscriptionStatus,
  UserId,
} from './models';

export interface LifecycleAction<Status extends string> {
  readonly label: string;
  readonly to: Status;
}

export const EPISODE_STATUS_LABELS = {
  draft: 'مسودة',
  scheduled: 'مجدولة',
  published: 'منشورة',
  archived: 'مؤرشفة',
} as const satisfies Record<EpisodeStatus, string>;

export const ARTICLE_STATUS_LABELS = {
  draft: 'مسودة',
  published: 'منشور',
} as const satisfies Record<ArticleStatus, string>;

export const SUBSCRIPTION_STATUS_LABELS = {
  active: 'نشط',
  past_due: 'متأخر السداد',
  canceled: 'ملغى',
} as const satisfies Record<SubscriptionStatus, string>;

export const EPISODE_TRANSITION_ACTIONS = {
  draft: [
    { label: 'نشر', to: 'published' },
    { label: 'جدولة', to: 'scheduled' },
  ],
  scheduled: [
    { label: 'نشر الآن', to: 'published' },
    { label: 'إلغاء الجدولة', to: 'draft' },
  ],
  published: [{ label: 'أرشفة', to: 'archived' }],
  archived: [{ label: 'استعادة', to: 'draft' }],
} as const satisfies Record<EpisodeStatus, readonly LifecycleAction<EpisodeStatus>[]>;

export const ARTICLE_TRANSITION_ACTIONS = {
  draft: [{ label: 'نشر', to: 'published' }],
  published: [{ label: 'تحويل إلى مسودة', to: 'draft' }],
} as const satisfies Record<ArticleStatus, readonly LifecycleAction<ArticleStatus>[]>;

/** Staff-facing subscription actions. Billing-driven transitions are server-owned. */
export const SUBSCRIPTION_TRANSITION_ACTIONS = {
  active: [],
  past_due: [{ label: 'تسجيل السداد يدويًا', to: 'active' }],
  canceled: [{ label: 'إعادة التفعيل يدويًا', to: 'active' }],
} as const satisfies Record<SubscriptionStatus, readonly LifecycleAction<SubscriptionStatus>[]>;

export type LifecycleDomain = 'episode' | 'article' | 'subscription';

export class LifecycleTransitionError extends Error {
  readonly domain: LifecycleDomain;
  readonly from: string;
  readonly to: string;

  constructor(domain: LifecycleDomain, from: string, to: string, reason?: string) {
    super(reason ?? `Illegal ${domain} lifecycle transition: ${from} -> ${to}`);
    this.name = 'LifecycleTransitionError';
    this.domain = domain;
    this.from = from;
    this.to = to;
  }
}

type DateInput = string | number | Date;

function toIso(value: DateInput): IsoDateTime {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date value: ${String(value)}`);
  return date.toISOString();
}

function oneMonthAfter(value: DateInput): IsoDateTime {
  const date = new Date(toIso(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

export function getEpisodeTransitionActions(
  status: EpisodeStatus,
): readonly LifecycleAction<EpisodeStatus>[] {
  return EPISODE_TRANSITION_ACTIONS[status];
}

export function canTransitionEpisode(from: EpisodeStatus, to: EpisodeStatus): boolean {
  return canTransitionApiEpisode(from, to);
}

export interface EpisodeTransitionOptions {
  now?: DateInput;
  /** Required when moving a draft to scheduled. Existing schedules may be retained. */
  scheduledAt?: DateInput;
}

export function transitionEpisode(
  episode: Episode,
  to: EpisodeStatus,
  options: EpisodeTransitionOptions = {},
): Episode {
  if (!canTransitionEpisode(episode.status, to)) {
    throw new LifecycleTransitionError('episode', episode.status, to);
  }

  const now = toIso(options.now ?? new Date());

  switch (to) {
    case 'draft':
      return {
        ...episode,
        status: 'draft',
        updatedAt: now,
        scheduledAt: undefined,
        publishedAt: undefined,
        archivedAt: undefined,
      };
    case 'scheduled': {
      const schedule = options.scheduledAt ?? episode.scheduledAt;
      if (schedule == null || schedule === '') {
        throw new LifecycleTransitionError(
          'episode',
          episode.status,
          to,
          'A scheduled episode requires a publication datetime.',
        );
      }
      return {
        ...episode,
        status: 'scheduled',
        updatedAt: now,
        scheduledAt: toIso(schedule),
        publishedAt: undefined,
        archivedAt: undefined,
      };
    }
    case 'published':
      return {
        ...episode,
        status: 'published',
        updatedAt: now,
        scheduledAt: undefined,
        publishedAt: now,
        archivedAt: undefined,
      };
    case 'archived':
      return {
        ...episode,
        status: 'archived',
        updatedAt: now,
        scheduledAt: undefined,
        archivedAt: now,
      };
  }
}

export function getArticleTransitionActions(
  status: ArticleStatus,
): readonly LifecycleAction<ArticleStatus>[] {
  return ARTICLE_TRANSITION_ACTIONS[status];
}

export function canTransitionArticle(from: ArticleStatus, to: ArticleStatus): boolean {
  return getArticleTransitionActions(from).some((action) => action.to === to);
}

export interface ArticleTransitionOptions {
  now?: DateInput;
}

export function transitionArticle(
  article: Article,
  to: ArticleStatus,
  options: ArticleTransitionOptions = {},
): Article {
  if (!canTransitionArticle(article.status, to)) {
    throw new LifecycleTransitionError('article', article.status, to);
  }

  const now = toIso(options.now ?? new Date());
  if (to === 'published') {
    return { ...article, status: 'published', updatedAt: now, publishedAt: now };
  }
  return { ...article, status: 'draft', updatedAt: now, publishedAt: undefined };
}

export function getSubscriptionTransitionActions(
  status: SubscriptionStatus,
): readonly LifecycleAction<SubscriptionStatus>[] {
  return SUBSCRIPTION_TRANSITION_ACTIONS[status];
}

export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return getSubscriptionTransitionActions(from).some((action) => action.to === to);
}

export interface SubscriptionTransitionOptions {
  now?: DateInput;
  renewAt?: DateInput;
}

export function transitionSubscription(
  subscription: Subscription,
  to: SubscriptionStatus,
  options: SubscriptionTransitionOptions = {},
): Subscription {
  if (!canTransitionSubscription(subscription.status, to)) {
    throw new LifecycleTransitionError('subscription', subscription.status, to);
  }

  const nowInput = options.now ?? new Date();
  const now = toIso(nowInput);
  return {
    ...subscription,
    status: 'active',
    updatedAt: now,
    renewAt: options.renewAt ? toIso(options.renewAt) : oneMonthAfter(nowInput),
    paymentFailedAt: undefined,
    canceledAt: undefined,
  };
}

export interface ManualPlusActivationOptions {
  now?: DateInput;
  renewAt?: DateInput;
  subscriptionId?: SubscriptionId;
  existingSubscription?: Subscription;
}

/** Implements the "تفعيل بلس يدويًا" action for a user with no subscription record. */
export function activatePlusForFreeUser(
  userId: UserId,
  plan: PlusPlan,
  options: ManualPlusActivationOptions = {},
): Subscription {
  if (options.existingSubscription) {
    throw new LifecycleTransitionError(
      'subscription',
      options.existingSubscription.status,
      'active',
      'Manual Plus activation is only legal for a user without a subscription record.',
    );
  }

  const nowInput = options.now ?? new Date();
  const now = toIso(nowInput);
  const id =
    options.subscriptionId ?? (`subscription_manual_${new Date(now).getTime()}` as SubscriptionId);

  return {
    id,
    userId,
    planId: plan.id,
    status: 'active',
    priceHalalas: plan.priceHalalas,
    startedAt: now,
    updatedAt: now,
    renewAt: options.renewAt ? toIso(options.renewAt) : oneMonthAfter(nowInput),
  };
}
