import { describe, expect, it } from 'vitest';

import { createDemoData, demoData } from './demo-data';
import type { GuestSocial } from './models';
import {
  filterArticles,
  filterEpisodes,
  getArticleStatusCounts,
  getEpisodeStatusCounts,
  getGuestAppearanceCount,
  getGuestEpisodeIds,
  getGuestEpisodes,
  getLatestPublishedEpisodes,
  getOverviewMetrics,
  getShowMetrics,
  getSubscriptionForUser,
  hasActivePlusSubscription,
  hasPlusAccount,
  socialProfileUrl,
} from './selectors';

describe('overview and status selectors', () => {
  it('derives the reference dashboard totals from record status', () => {
    expect(getOverviewMetrics(createDemoData())).toEqual({
      showCount: 5,
      publishedEpisodeCount: 6,
      activeSubscriberCount: 2,
    });
  });

  it('sorts only published episodes newest-first without mutating the input', () => {
    const data = createDemoData();
    const originalOrder = data.episodes.map(({ id }) => id);

    expect(getLatestPublishedEpisodes(data.episodes).map(({ id }) => id)).toEqual([
      'episode_1',
      'episode_2',
      'episode_3',
      'episode_4',
    ]);
    expect(data.episodes.map(({ id }) => id)).toEqual(originalOrder);
  });

  it('honors zero, positive, and negative latest-episode limits', () => {
    const episodes = createDemoData().episodes;
    expect(getLatestPublishedEpisodes(episodes, 2).map(({ id }) => id)).toEqual([
      'episode_1',
      'episode_2',
    ]);
    expect(getLatestPublishedEpisodes(episodes, 0)).toEqual([]);
    expect(getLatestPublishedEpisodes(episodes, -3)).toEqual([]);
  });

  it('counts every episode and article status explicitly', () => {
    const data = createDemoData();
    expect(getEpisodeStatusCounts(data.episodes)).toEqual({
      all: 11,
      draft: 2,
      scheduled: 2,
      published: 6,
      archived: 1,
    });
    expect(getArticleStatusCounts(data.articles)).toEqual({
      all: 4,
      draft: 2,
      published: 2,
    });
  });
});

describe('content filtering', () => {
  it('combines episode status and show filters', () => {
    const data = createDemoData();
    expect(
      filterEpisodes(data, { status: 'scheduled', showId: 'show_batrooli' }).map(({ id }) => id),
    ).toEqual(['episode_8']);
    expect(filterEpisodes(data, { status: 'all', showId: 'all' })).toHaveLength(11);
  });

  it('searches episode title, normalized show name, and Arabic episode number together', () => {
    const data = createDemoData();
    expect(filterEpisodes(data, { query: 'بترولي ۲۲' }).map(({ id }) => id)).toEqual(['episode_8']);
    expect(filterEpisodes(data, { query: 'الاداره مهندس' }).map(({ id }) => id)).toEqual([
      'episode_6',
    ]);
    expect(filterEpisodes(data, { query: 'بترولي ٢٢ غيرموجود' })).toEqual([]);
  });

  it('filters articles by normalized title and author terms', () => {
    const articles = createDemoData().articles;
    expect(filterArticles(articles, { query: 'احمد' }).map(({ id }) => id)).toEqual(['article_2']);
    expect(
      filterArticles(articles, { status: 'published', query: 'فريق مختلف' }).map(({ id }) => id),
    ).toEqual(['article_4']);
    expect(filterArticles(articles, { status: 'draft', query: 'الصيف' })).toEqual([]);
  });

  it('does not reorder or mutate source collections while filtering', () => {
    const data = createDemoData();
    const episodeSnapshot = structuredClone(data.episodes);
    const articleSnapshot = structuredClone(data.articles);
    filterEpisodes(data, { status: 'published', query: 'حلقة' });
    filterArticles(data.articles, { status: 'published', query: 'فريق' });
    expect(data.episodes).toEqual(episodeSnapshot);
    expect(data.articles).toEqual(articleSnapshot);
  });
});

describe('show and guest relation selectors', () => {
  it('derives show metrics in source show order', () => {
    const data = createDemoData();
    const metrics = getShowMetrics(data);
    expect(metrics.map(({ show }) => show.id)).toEqual(data.shows.map(({ id }) => id));
    expect(metrics.find(({ show }) => show.id === 'show_batrooli')).toMatchObject({
      episodeCount: 3,
      publishedCount: 2,
    });
    expect(metrics.find(({ show }) => show.id === 'show_sira')).toMatchObject({
      episodeCount: 2,
      publishedCount: 1,
    });
  });

  it('selects guest appearance IDs in relation order', () => {
    const appearances = createDemoData().guestAppearances;
    expect(getGuestEpisodeIds(appearances, 'guest_raed')).toEqual([
      'episode_4',
      'episode_6',
      'episode_8',
      'episode_1',
      'episode_3',
      'episode_11',
    ]);
    expect(getGuestAppearanceCount(appearances, 'guest_raed')).toBe(6);
    expect(getGuestAppearanceCount(appearances, 'guest_lamia')).toBe(1);
  });

  it('selects related guest episodes in episode repository order', () => {
    const data = createDemoData();
    expect(getGuestEpisodes(data, 'guest_raed').map(({ id }) => id)).toEqual([
      'episode_8',
      'episode_1',
      'episode_3',
      'episode_4',
      'episode_6',
      'episode_11',
    ]);
    expect(getGuestEpisodes(data, 'guest_unknown')).toEqual([]);
  });
});

describe('subscription selectors', () => {
  const data = createDemoData();
  const active = getSubscriptionForUser(data.subscriptions, 'user_noura');
  const pastDue = getSubscriptionForUser(data.subscriptions, 'user_sarah');
  const canceled = getSubscriptionForUser(data.subscriptions, 'user_khalid');
  const absent = getSubscriptionForUser(data.subscriptions, 'user_reem');

  it('looks up a subscription by user and returns undefined for a free user', () => {
    expect(active?.id).toBe('subscription_noura');
    expect(absent).toBeUndefined();
  });

  it('retains the Plus account label for active and past-due records only', () => {
    expect(hasPlusAccount(active)).toBe(true);
    expect(hasPlusAccount(pastDue)).toBe(true);
    expect(hasPlusAccount(canceled)).toBe(false);
    expect(hasPlusAccount(absent)).toBe(false);
  });

  it('recognizes only active records as active Plus subscriptions', () => {
    expect(hasActivePlusSubscription(active)).toBe(true);
    expect(hasActivePlusSubscription(pastDue)).toBe(false);
    expect(hasActivePlusSubscription(canceled)).toBe(false);
    expect(hasActivePlusSubscription(absent)).toBe(false);
  });
});

describe('social profile URL construction', () => {
  it.each([
    [{ platform: 'x', handle: ' @mukhtalif ' }, 'https://x.com/mukhtalif'],
    [{ platform: 'linkedin', handle: '/in/mukhtalif' }, 'https://linkedin.com/in/mukhtalif'],
    [{ platform: 'instagram', handle: '@mukhtalif' }, 'https://instagram.com/mukhtalif'],
    [{ platform: 'youtube', handle: '/@mukhtalif' }, 'https://youtube.com/@mukhtalif'],
    [{ platform: 'website', handle: 'mukhtalif.com' }, 'https://mukhtalif.com'],
    [
      { platform: 'website', handle: 'https://mukhtalif.com/guests' },
      'https://mukhtalif.com/guests',
    ],
  ] as const)(
    'builds a canonical URL for $platform',
    (social: Pick<GuestSocial, 'platform' | 'handle'>, expected: string) => {
      expect(socialProfileUrl(social)).toBe(expected);
    },
  );
});

describe('demo repository snapshots', () => {
  it('returns fresh arrays and records for every state container', () => {
    const first = createDemoData();
    const second = createDemoData();

    expect(first).not.toBe(second);
    expect(first.viewer).not.toBe(second.viewer);
    expect(first.plusPlan).not.toBe(second.plusPlan);
    for (const key of [
      'shows',
      'episodes',
      'articles',
      'guests',
      'guestSocials',
      'guestAppearances',
      'users',
      'subscriptions',
    ] as const) {
      expect(first[key]).not.toBe(second[key]);
      expect(first[key][0]).not.toBe(second[key][0]);
      expect(first[key]).toEqual(second[key]);
    }
  });

  it('isolates mutations from later snapshots and the exported reference snapshot', () => {
    const first = createDemoData();
    const originalName = demoData.shows[0]?.name;
    if (!first.shows[0]) throw new Error('Expected seeded show data.');

    first.shows[0].name = 'اسم معدل';
    first.episodes.pop();

    const second = createDemoData();
    expect(second.shows[0]?.name).toBe(originalName);
    expect(second.episodes).toHaveLength(demoData.episodes.length);
    expect(demoData.shows[0]?.name).toBe(originalName);
  });

  it('preserves all seeded foreign-key relations', () => {
    const data = createDemoData();
    const showIds = new Set(data.shows.map(({ id }) => id));
    const episodeIds = new Set(data.episodes.map(({ id }) => id));
    const guestIds = new Set(data.guests.map(({ id }) => id));
    const userIds = new Set(data.users.map(({ id }) => id));

    expect(data.episodes.every(({ showId }) => showIds.has(showId))).toBe(true);
    expect(
      data.guestAppearances.every(
        ({ guestId, episodeId }) => guestIds.has(guestId) && episodeIds.has(episodeId),
      ),
    ).toBe(true);
    expect(data.guestSocials.every(({ guestId }) => guestIds.has(guestId))).toBe(true);
    expect(data.subscriptions.every(({ userId }) => userIds.has(userId))).toBe(true);
    expect(data.subscriptions.every(({ planId }) => planId === data.plusPlan.id)).toBe(true);
  });
});
