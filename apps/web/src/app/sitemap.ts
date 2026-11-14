import type { MetadataRoute } from 'next';
import type { PaginatedList } from '@mukhtalif/types';
import { listArticles, listCourses, listEpisodes, listGuests, listShows } from '@/lib/api';
import { absoluteUrl } from '@/lib/config';
import { COMMUNITIES, NEWSLETTERS, PRESENTERS } from '@/lib/communities';

// Built on request from the live catalogue, never at build time, so a build
// without API access still succeeds and the list is never stale.
export const dynamic = 'force-dynamic';

/** Public pages that exist once; the account and utility pages are left out on purpose. */
export const STATIC_PATHS = [
  '/',
  '/shows',
  '/episodes',
  '/articles',
  '/guests',
  '/courses',
  '/communities',
  '/presenters',
  '/contact',
  '/about',
  '/mission',
  '/services',
  '/work',
  '/sponsor',
  '/prodservice',
  '/join-us',
  '/suggest',
  '/greview',
  '/privacy',
  '/terms',
];

const PAGE_SIZE = 100;

async function everyPage<T>(load: (page: number) => Promise<PaginatedList<T>>): Promise<T[]> {
  const first = await load(1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.pageInfo.totalPages - 1) }, (_, i) => load(i + 2)),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

const date = (value: string | null | undefined) => (value ? new Date(value) : undefined);
const segment = (value: string) => encodeURIComponent(value);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [shows, episodes, articles, guests, courses] = await Promise.all([
    listShows(),
    everyPage((page) => listEpisodes({ page, perPage: PAGE_SIZE })),
    everyPage((page) => listArticles({ page, perPage: PAGE_SIZE })),
    everyPage((page) => listGuests({ page, perPage: PAGE_SIZE })),
    listCourses(),
  ]);

  return [
    ...STATIC_PATHS.map((path) => ({ url: absoluteUrl(path) })),
    ...COMMUNITIES.map((community) => ({ url: absoluteUrl(`/communities/${community.slug}`) })),
    ...PRESENTERS.map((presenter) => ({ url: absoluteUrl(`/presenters/${presenter.slug}`) })),
    ...NEWSLETTERS.map((newsletter) => ({ url: absoluteUrl(`/newsletters/${newsletter.slug}`) })),
    ...shows.map((show) => ({ url: absoluteUrl(`/shows/${segment(show.slug)}`) })),
    ...episodes.map((episode) => ({
      url: absoluteUrl(`/episodes/${segment(episode.id)}`),
      lastModified: date(episode.publishAt),
    })),
    ...articles
      // An article that names another page as its canonical is that page's copy.
      .filter((article) => !article.seo?.canonicalUrl)
      .map((article) => ({
        url: absoluteUrl(`/articles/${segment(article.slug)}`),
        lastModified: date(article.updatedAt ?? article.publishedAt),
      })),
    ...guests.map((guest) => ({ url: absoluteUrl(`/guests/${segment(guest.slug)}`) })),
    ...courses.map((course) => ({ url: absoluteUrl(`/courses/${segment(course.id)}`) })),
  ];
}
