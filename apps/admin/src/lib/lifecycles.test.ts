import { describe, expect, it } from 'vitest';

import {
  activatePlusForFreeUser,
  ARTICLE_TRANSITION_ACTIONS,
  canTransitionArticle,
  canTransitionEpisode,
  canTransitionSubscription,
  EPISODE_TRANSITION_ACTIONS,
  getArticleTransitionActions,
  getEpisodeTransitionActions,
  getSubscriptionTransitionActions,
  LifecycleTransitionError,
  SUBSCRIPTION_TRANSITION_ACTIONS,
  transitionArticle,
  transitionEpisode,
  transitionSubscription,
} from './lifecycles';
import {
  ARTICLE_STATUSES,
  EPISODE_STATUSES,
  SUBSCRIPTION_STATUSES,
  type Article,
  type ArticleStatus,
  type Episode,
  type EpisodeStatus,
  type PlusPlan,
  type Subscription,
  type SubscriptionStatus,
} from './models';

const NOW = '2026-08-16T09:30:00.000Z';
const ORIGINAL_UPDATED_AT = '2026-08-01T08:00:00.000Z';

function episode(status: EpisodeStatus, patch: Partial<Episode> = {}): Episode {
  return {
    id: 'episode_test',
    title: 'حلقة اختبار',
    showId: 'show_test',
    episodeNumber: 12,
    durationMinutes: 42,
    status,
    premium: false,
    notes: '',
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: ORIGINAL_UPDATED_AT,
    ...patch,
  };
}

function article(status: ArticleStatus, patch: Partial<Article> = {}): Article {
  return {
    id: 'article_test',
    slug: 'test-article',
    title: 'مقال اختبار',
    author: { type: 'custom', displayName: 'فريق مختلف' },
    authorPlacement: 'after_title',
    summary: 'ملخص ثابت',
    excerpt: 'ملخص ثابت',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص الاختبار' }] }],
    },
    contentHtml: '<p>نص الاختبار</p>',
    body: 'نص الاختبار',
    seo: { noIndex: false },
    status,
    newsletter: { enabled: false, status: 'not_started', needsSync: false },
    version: 1,
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: ORIGINAL_UPDATED_AT,
    ...patch,
  };
}

function subscription(status: SubscriptionStatus, patch: Partial<Subscription> = {}): Subscription {
  return {
    id: 'subscription_test',
    userId: 'user_test',
    planId: 'plan_plus',
    status,
    priceHalalas: 2900,
    startedAt: '2026-07-01T08:00:00.000Z',
    updatedAt: ORIGINAL_UPDATED_AT,
    ...patch,
  };
}

const plan: PlusPlan = {
  id: 'plan_plus',
  name: 'مختلف بلس',
  priceHalalas: 2900,
  currency: 'SAR',
  interval: 'month',
};

function expectTransitionError(
  operation: () => unknown,
  expected: { domain: 'episode' | 'article' | 'subscription'; from: string; to: string },
): void {
  try {
    operation();
    throw new Error('Expected the lifecycle transition to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(LifecycleTransitionError);
    expect(error).toMatchObject(expected);
  }
}

describe('episode lifecycle contract', () => {
  const legalTargets: Record<EpisodeStatus, readonly EpisodeStatus[]> = {
    draft: ['published', 'scheduled'],
    scheduled: ['published', 'draft'],
    published: ['archived'],
    archived: ['draft'],
  };

  it('publishes the exact staff-facing action contract', () => {
    expect(EPISODE_TRANSITION_ACTIONS).toEqual({
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
    });
    for (const status of EPISODE_STATUSES) {
      expect(getEpisodeTransitionActions(status)).toBe(EPISODE_TRANSITION_ACTIONS[status]);
    }
  });

  it('recognizes every legal and illegal transition in the status matrix', () => {
    for (const from of EPISODE_STATUSES) {
      for (const to of EPISODE_STATUSES) {
        expect(canTransitionEpisode(from, to), `${from} -> ${to}`).toBe(
          legalTargets[from].includes(to),
        );
      }
    }
  });

  it('schedules a draft with normalized timestamps and without publication residue', () => {
    const source = episode('draft', {
      publishedAt: '2026-07-15T08:00:00.000Z',
      archivedAt: '2026-07-20T08:00:00.000Z',
    });
    const result = transitionEpisode(source, 'scheduled', {
      now: NOW,
      scheduledAt: '2026-09-01T12:30:00+03:00',
    });

    expect(result).toMatchObject({
      status: 'scheduled',
      updatedAt: NOW,
      scheduledAt: '2026-09-01T09:30:00.000Z',
    });
    expect(result.publishedAt).toBeUndefined();
    expect(result.archivedAt).toBeUndefined();
    expect(source).toMatchObject({ status: 'draft', updatedAt: ORIGINAL_UPDATED_AT });
    expect(result).not.toBe(source);
  });

  it('retains an existing schedule when a replacement is not supplied', () => {
    const result = transitionEpisode(
      episode('draft', { scheduledAt: '2026-08-20T07:00:00+03:00' }),
      'scheduled',
      { now: NOW },
    );
    expect(result.scheduledAt).toBe('2026-08-20T04:00:00.000Z');
  });

  it('requires a valid publication datetime when scheduling', () => {
    expectTransitionError(() => transitionEpisode(episode('draft'), 'scheduled', { now: NOW }), {
      domain: 'episode',
      from: 'draft',
      to: 'scheduled',
    });
    expect(() =>
      transitionEpisode(episode('draft'), 'scheduled', {
        now: NOW,
        scheduledAt: 'not-a-date',
      }),
    ).toThrow(RangeError);
  });

  it.each(['draft', 'scheduled'] as const)(
    'publishes from %s and clears scheduling and archive timestamps',
    (from: 'draft' | 'scheduled') => {
      const result = transitionEpisode(
        episode(from, {
          scheduledAt: '2026-08-20T04:00:00.000Z',
          archivedAt: '2026-07-20T08:00:00.000Z',
        }),
        'published',
        { now: NOW },
      );
      expect(result).toMatchObject({ status: 'published', updatedAt: NOW, publishedAt: NOW });
      expect(result.scheduledAt).toBeUndefined();
      expect(result.archivedAt).toBeUndefined();
    },
  );

  it('returns a scheduled episode to a clean draft', () => {
    const result = transitionEpisode(
      episode('scheduled', {
        scheduledAt: '2026-08-20T04:00:00.000Z',
        publishedAt: '2026-07-15T08:00:00.000Z',
        archivedAt: '2026-07-20T08:00:00.000Z',
      }),
      'draft',
      { now: NOW },
    );
    expect(result.status).toBe('draft');
    expect(result.updatedAt).toBe(NOW);
    expect(result.scheduledAt).toBeUndefined();
    expect(result.publishedAt).toBeUndefined();
    expect(result.archivedAt).toBeUndefined();
  });

  it('archives a publication while preserving its publication timestamp', () => {
    const publishedAt = '2026-07-15T08:00:00.000Z';
    const result = transitionEpisode(
      episode('published', {
        publishedAt,
        scheduledAt: '2026-08-20T04:00:00.000Z',
      }),
      'archived',
      { now: NOW },
    );
    expect(result).toMatchObject({
      status: 'archived',
      updatedAt: NOW,
      publishedAt,
      archivedAt: NOW,
    });
    expect(result.scheduledAt).toBeUndefined();
  });

  it('restores an archive as a clean draft', () => {
    const result = transitionEpisode(
      episode('archived', {
        publishedAt: '2026-07-15T08:00:00.000Z',
        archivedAt: '2026-07-20T08:00:00.000Z',
      }),
      'draft',
      { now: NOW },
    );
    expect(result).toMatchObject({ status: 'draft', updatedAt: NOW });
    expect(result.publishedAt).toBeUndefined();
    expect(result.archivedAt).toBeUndefined();
  });

  it('throws a structured domain error for every illegal transition', () => {
    for (const from of EPISODE_STATUSES) {
      for (const to of EPISODE_STATUSES) {
        if (legalTargets[from].includes(to)) continue;
        expectTransitionError(() => transitionEpisode(episode(from), to, { now: NOW }), {
          domain: 'episode',
          from,
          to,
        });
      }
    }
  });

  it('rejects an invalid transition clock', () => {
    expect(() => transitionEpisode(episode('draft'), 'published', { now: 'invalid' })).toThrow(
      RangeError,
    );
  });
});

describe('article lifecycle contract', () => {
  const legalTargets: Record<ArticleStatus, readonly ArticleStatus[]> = {
    draft: ['published'],
    published: ['draft'],
  };

  it('publishes the exact action contract and exhaustive matrix', () => {
    expect(ARTICLE_TRANSITION_ACTIONS).toEqual({
      draft: [{ label: 'نشر', to: 'published' }],
      published: [{ label: 'تحويل إلى مسودة', to: 'draft' }],
    });
    for (const from of ARTICLE_STATUSES) {
      expect(getArticleTransitionActions(from)).toBe(ARTICLE_TRANSITION_ACTIONS[from]);
      for (const to of ARTICLE_STATUSES) {
        expect(canTransitionArticle(from, to), `${from} -> ${to}`).toBe(
          legalTargets[from].includes(to),
        );
      }
    }
  });

  it('publishes a draft with an authoritative timestamp without mutating it', () => {
    const source = article('draft');
    const result = transitionArticle(source, 'published', { now: NOW });
    expect(result).toMatchObject({ status: 'published', updatedAt: NOW, publishedAt: NOW });
    expect(result).not.toBe(source);
    expect(source).toMatchObject({ status: 'draft', updatedAt: ORIGINAL_UPDATED_AT });
  });

  it('returns a published article to draft and clears publication metadata', () => {
    const result = transitionArticle(
      article('published', { publishedAt: '2026-08-10T08:00:00.000Z' }),
      'draft',
      { now: NOW },
    );
    expect(result).toMatchObject({ status: 'draft', updatedAt: NOW });
    expect(result.publishedAt).toBeUndefined();
  });

  it('rejects both self-transitions with structured errors', () => {
    for (const status of ARTICLE_STATUSES) {
      expectTransitionError(() => transitionArticle(article(status), status, { now: NOW }), {
        domain: 'article',
        from: status,
        to: status,
      });
    }
  });
});

describe('subscription lifecycle contract', () => {
  const legalTargets: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
    active: [],
    past_due: ['active'],
    canceled: ['active'],
  };

  it('exposes only the two staff-owned recovery actions', () => {
    expect(SUBSCRIPTION_TRANSITION_ACTIONS).toEqual({
      active: [],
      past_due: [{ label: 'تسجيل السداد يدويًا', to: 'active' }],
      canceled: [{ label: 'إعادة التفعيل يدويًا', to: 'active' }],
    });
    for (const from of SUBSCRIPTION_STATUSES) {
      expect(getSubscriptionTransitionActions(from)).toBe(SUBSCRIPTION_TRANSITION_ACTIONS[from]);
      for (const to of SUBSCRIPTION_STATUSES) {
        expect(canTransitionSubscription(from, to), `${from} -> ${to}`).toBe(
          legalTargets[from].includes(to),
        );
      }
    }
  });

  it.each(['past_due', 'canceled'] as const)(
    'recovers %s to active and clears failure metadata',
    (from: 'past_due' | 'canceled') => {
      const source = subscription(from, {
        paymentFailedAt: '2026-08-10T08:00:00.000Z',
        canceledAt: '2026-08-11T08:00:00.000Z',
      });
      const result = transitionSubscription(source, 'active', {
        now: NOW,
        renewAt: '2026-10-01T12:00:00+03:00',
      });
      expect(result).toMatchObject({
        status: 'active',
        updatedAt: NOW,
        renewAt: '2026-10-01T09:00:00.000Z',
      });
      expect(result.paymentFailedAt).toBeUndefined();
      expect(result.canceledAt).toBeUndefined();
      expect(result).not.toBe(source);
    },
  );

  it('defaults the renewal to one calendar month after recovery', () => {
    const result = transitionSubscription(subscription('past_due'), 'active', {
      now: '2026-01-15T09:30:00.000Z',
    });
    expect(result.renewAt).toBe('2026-02-15T09:30:00.000Z');
  });

  it('rejects billing-owned and self-transitions', () => {
    for (const from of SUBSCRIPTION_STATUSES) {
      for (const to of SUBSCRIPTION_STATUSES) {
        if (legalTargets[from].includes(to)) continue;
        expectTransitionError(() => transitionSubscription(subscription(from), to, { now: NOW }), {
          domain: 'subscription',
          from,
          to,
        });
      }
    }
  });

  it('creates a deterministic manual Plus subscription for a free user', () => {
    const result = activatePlusForFreeUser('user_free', plan, {
      now: NOW,
      subscriptionId: 'subscription_manual_test',
      renewAt: '2026-09-20T12:00:00+03:00',
    });
    expect(result).toEqual({
      id: 'subscription_manual_test',
      userId: 'user_free',
      planId: 'plan_plus',
      status: 'active',
      priceHalalas: 2900,
      startedAt: NOW,
      updatedAt: NOW,
      renewAt: '2026-09-20T09:00:00.000Z',
    });
  });

  it('derives stable defaults from the supplied activation clock', () => {
    const result = activatePlusForFreeUser('user_free', plan, {
      now: '2026-01-15T09:30:00.000Z',
    });
    expect(result.id).toBe(`subscription_manual_${Date.parse('2026-01-15T09:30:00.000Z')}`);
    expect(result.renewAt).toBe('2026-02-15T09:30:00.000Z');
  });

  it('rejects manual activation when any subscription record already exists', () => {
    const existing = subscription('canceled');
    expectTransitionError(
      () =>
        activatePlusForFreeUser('user_test', plan, { existingSubscription: existing, now: NOW }),
      { domain: 'subscription', from: 'canceled', to: 'active' },
    );
  });
});
