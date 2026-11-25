import type { Metadata } from 'next';
import Link from 'next/link';
import { isYouTubeVideoId, type Episode, type PaginatedList, type Show } from '@mukhtalif/types';
import { BrandIcon } from '@/components/brand-icon';
import { EpisodeCard } from '@/components/cards';
import { EpisodeLibraryActions } from '@/components/episode-library-actions';
import {
  EPISODES_NOUN,
  PROGRAMMES_NOUN,
  countInWords,
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from '@/components/formatting';
import { Pager, pageHref, parsePage } from '@/components/pager';
import { PlayEpisodeButton, type PlayerEpisode } from '@/components/player';
import { RailControls } from '@/components/public-content-controls';
import { EmptyState, ErrorState } from '@/components/states';
import { YouTubeStill } from '@/components/youtube-still';
import { ApiUnavailableError, listEpisodes, listShows } from '@/lib/api';
import { showFace, showHref } from '@/lib/communities';
import { publicEpisodeAudioSrc } from '@/lib/player-source';
import { episodeSort, singleQuery } from '@/lib/public-content';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'الحلقات',
  description: 'تجارب من قلب المهنة، وأسئلة تفتح عوالم جديدة.',
  alternates: { canonical: '/episodes' },
};

const SORTS = [
  ['latest', 'الأحدث'],
  ['shortest', 'الأقصر'],
  ['longest', 'الأطول'],
] as const;

/**
 * «استمع», the episodes index of the presentation site (D-24). The newest
 * episode crosses from the night stage onto the sheet, where it is introduced;
 * the whole catalogue follows, with the programmes as their own covers to
 * choose from, a search, the order and the pages. A choice reloads the list at
 * #all, so the reader stays at the list instead of the top of the stage.
 */
export default async function EpisodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = await searchParams;
  const page = parsePage(requested.page),
    search = singleQuery(requested.search),
    showId = singleQuery(requested.showId),
    sort = episodeSort(singleQuery(requested.sort));
  const sortParam = sort === 'latest' ? undefined : sort;

  let episodes: PaginatedList<Episode> | null = null;
  let shows: Show[] = [];
  let catalogue = 0;
  try {
    const [list, showList, all] = await Promise.all([
      listEpisodes({ page, perPage: 12, search, showId, sort }),
      listShows(),
      // The stage counts the whole catalogue, whatever the list shows.
      search || showId ? listEpisodes({ perPage: 1 }) : null,
    ]);
    episodes = list;
    shows = showList;
    catalogue = (all ?? list).pageInfo.total;
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }

  const byId = new Map(shows.map((show) => [show.id, show]));
  const featured =
    episodes && page === 1 && !search && sort === 'latest' ? episodes.items[0] : undefined;
  const featuredShow = featured ? byId.get(featured.showId) : undefined;
  const featuredHref = featured ? `/episodes/${encodeURIComponent(featured.id)}` : '';
  const crosses = Boolean(
    featured && !featured.premium && isYouTubeVideoId(featured.youtubeVideoId),
  );
  const featuredAudio = featured ? publicEpisodeAudioSrc(featured.id) : null;
  const featuredPlayer: PlayerEpisode | null =
    featured && featuredAudio && !featured.premium
      ? {
          id: featured.id,
          title: featured.titleAr,
          showTitle: featuredShow?.titleAr,
          href: featuredHref,
          durationSec: featured.durationSec,
          audioSrc: featuredAudio,
          youtubeVideoId: featured.youtubeVideoId,
          artworkUrl: isYouTubeVideoId(featured.youtubeVideoId)
            ? `https://i.ytimg.com/vi/${featured.youtubeVideoId}/hqdefault.jpg`
            : featuredShow?.artworkUrl,
        }
      : null;
  const listHref = (query: Record<string, string | undefined>) =>
    pageHref('/episodes', 1, query) + '#all';

  return (
    <div className={'stage-page listen-page' + (crosses ? ' has-cross' : '')}>
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="episodes-title">
          <div className="content-container stage-head">
            <h1 id="episodes-title" className="stage-statement">
              الحلقات
            </h1>
            <p className="stage-head__lede">
              تجارب من قلب المهنة، وأسئلة تفتح عوالم جديدة.
              {catalogue && shows.length ? (
                <>
                  {' '}
                  <span className="stage-head__fact">
                    {countInWords(catalogue, EPISODES_NOUN)} من{' '}
                    {countInWords(shows.length, PROGRAMMES_NOUN)}.
                  </span>
                </>
              ) : null}
            </p>
          </div>
          {crosses && featured ? (
            <Link className="stage-cross" href={featuredHref} tabIndex={-1} aria-hidden="true">
              <YouTubeStill videoId={featured.youtubeVideoId} priority />
            </Link>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {featured ? (
            <article
              className="content-container stage-feature stage-feature--episode"
              aria-labelledby="featured-title"
            >
              <p className="stage-head__crumbs">
                {featuredShow ? (
                  <Link href={showHref(featuredShow.slug)}>{showFace(featuredShow).name}</Link>
                ) : null}
                <span className="stage-head__accent">
                  الحلقة {formatNumber(featured.episodeNumber)}
                </span>
              </p>
              <h2 className="stage-feature__title" id="featured-title">
                <Link href={featuredHref}>{featured.titleAr}</Link>
              </h2>
              <p className="stage-head__meta stage-feature__meta">
                {featured.publishAt ? (
                  <time dateTime={dateTimeAttribute(featured.publishAt)}>
                    {formatDate(featured.publishAt)}
                  </time>
                ) : null}
                {formatDuration(featured.durationSec) ? (
                  <span className="stage-head__icon-text">
                    <BrandIcon name="clock" />
                    <bdi>{formatDuration(featured.durationSec)}</bdi>
                  </span>
                ) : null}
                {featured.premium ? (
                  <span className="stage-head__strong">حصرية للمشتركين</span>
                ) : null}
              </p>
              <div className="stage-head__actions">
                {featuredPlayer ? (
                  <>
                    <PlayEpisodeButton episode={featuredPlayer} variant="label" />
                    <EpisodeLibraryActions episode={featuredPlayer} compact />
                  </>
                ) : (
                  <Link className="public-primary" href={featuredHref}>
                    تفاصيل الحلقة
                  </Link>
                )}
              </div>
            </article>
          ) : null}

          <section className="listen-all" id="all" aria-labelledby="all-title">
            <div className="content-container home-head">
              <h2 className="cover-section__title" id="all-title">
                كل الحلقات
              </h2>
              {shows.length ? (
                <div className="home-head__tools">
                  <RailControls target="listen-programmes" label="البرامج" reveal />
                </div>
              ) : null}
            </div>
            {shows.length ? (
              <ul
                id="listen-programmes"
                className="stage-rail listen-programmes"
                aria-label="اختر برنامجًا"
                tabIndex={0}
              >
                <li>
                  <Link
                    className="listen-programme"
                    href={listHref({ search, sort: sortParam })}
                    aria-current={showId ? undefined : 'true'}
                  >
                    <span className="listen-programme__all" aria-hidden="true">
                      {shows.slice(0, 4).map((item) => {
                        const cover = showFace(item).cover;
                        return cover ? (
                          <img key={item.id} src={cover} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span key={item.id} className="listen-programme__blank" />
                        );
                      })}
                    </span>
                    <span className="listen-programme__name">كل البرامج</span>
                  </Link>
                </li>
                {shows.map((show) => {
                  const face = showFace(show);
                  return (
                    <li key={show.id} data-tone={face.tone}>
                      <Link
                        className="listen-programme"
                        href={listHref({ search, showId: show.id, sort: sortParam })}
                        aria-current={show.id === showId ? 'true' : undefined}
                      >
                        {face.cover ? (
                          <img
                            className="listen-programme__cover"
                            src={face.cover}
                            alt=""
                            width={104}
                            height={104}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span
                            className="listen-programme__cover listen-programme__blank"
                            aria-hidden="true"
                          />
                        )}
                        <span className="listen-programme__name">{face.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="content-container">
              <div className="listen-bar">
                <form className="listen-find" action="/episodes#all" role="search">
                  <label className="visually-hidden" htmlFor="listen-search">
                    ابحث في الحلقات
                  </label>
                  <input
                    id="listen-search"
                    type="search"
                    name="search"
                    defaultValue={search}
                    placeholder="ابحث عن حلقة"
                    maxLength={160}
                  />
                  {showId ? <input type="hidden" name="showId" value={showId} /> : null}
                  {sortParam ? <input type="hidden" name="sort" value={sortParam} /> : null}
                  <button type="submit" aria-label="ابحث">
                    <BrandIcon name="search" />
                  </button>
                </form>
                <nav className="listen-sort" aria-label="ترتيب الحلقات">
                  {SORTS.map(([value, label]) => (
                    <Link
                      key={value}
                      href={listHref({
                        search,
                        showId,
                        sort: value === 'latest' ? undefined : value,
                      })}
                      aria-current={sort === value ? 'true' : undefined}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
                {episodes ? (
                  <p className="listen-count">
                    {countInWords(episodes.pageInfo.total, EPISODES_NOUN)}
                    {search ? <> للبحث عن «{search}»</> : null}
                    {search ? (
                      <>
                        {' '}
                        <Link href={listHref({ showId, sort: sortParam })}>مسح البحث</Link>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              {episodes === null ? (
                <ErrorState />
              ) : episodes.items.length ? (
                <>
                  <div className="listen-cards" role="list">
                    {episodes.items.map((episode) => {
                      const show = byId.get(episode.showId);
                      return (
                        <EpisodeCard
                          key={episode.id}
                          episode={episode}
                          showName={show ? showFace(show).name : undefined}
                          showArtwork={show?.artworkUrl}
                        />
                      );
                    })}
                  </div>
                  <Pager
                    pageInfo={episodes.pageInfo}
                    basePath="/episodes"
                    query={{ search, showId, sort: sortParam }}
                    hash="#all"
                  />
                </>
              ) : (
                <EmptyState
                  title={
                    search || showId
                      ? 'لا توجد حلقات بهذه الشروط'
                      : page > 1
                        ? 'لا مزيد من الحلقات'
                        : 'لا توجد حلقات منشورة بعد'
                  }
                  text={
                    search || showId
                      ? 'اختر برنامجًا آخر أو غيّر كلمة البحث.'
                      : 'ستظهر الحلقات هنا فور نشرها.'
                  }
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
