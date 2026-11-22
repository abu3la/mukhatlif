'use client';

import { ArticleTiles, type TileArticle } from './article-tile';
import { BrandIcon } from './brand-icon';
import { BusyButton } from './busy-button';
import { ContentSkeleton } from './content-skeleton';
import { EpisodeCardView } from './episode-card';
import { EpisodeLibraryActions } from './episode-library-actions';
import { RailControls } from './public-content-controls';
import { YouTubeStill } from './youtube-still';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  isYouTubeVideoId,
  youtubeThumbnailUrl,
  type CustomerBookmark,
  type CustomerPlaylist,
  type Episode,
  type PaginatedList,
  type PublishedArticle,
  type Show,
} from '@mukhtalif/types';
import { CUSTOMER_TOPICS, customerError, episodeCount } from '@/lib/customer-utils';
import { showFace, showHref } from '@/lib/communities';
import { useCustomer } from './customer-provider';
import {
  CustomerDialog,
  CustomerEmpty,
  CustomerField,
  CustomerGate,
  CustomerIcon,
  validateCustomerForm,
} from './customer-ui';
import {
  CustomerEpisodeList,
  CustomerEpisodeRow,
  customerPlayerEpisode,
  useCustomerEpisodes,
} from './customer-content';
import { PlayEpisodeButton, usePlayer } from './player';
import { formatPlaybackTime } from './player-utils';
import { formatDuration, formatNumber } from './formatting';

const tabs = [
  ['saved', 'المحفوظات'],
  ['followed', 'برامج تتابعها'],
  ['history', 'سجل الاستماع'],
  ['playlists', 'قوائم التشغيل'],
  ['interests', 'اهتماماتي'],
] as const;
export type CustomerLibraryTab = (typeof tabs)[number][0];

/**
 * «مكتبتي» on the presentation site (D-24). The overview stands on the night
 * stage: the episode the listener stopped in crosses onto the sheet with how
 * far they got, then what they saved, follow, collected and marked. Each full
 * list («سجل الاستماع», «اهتماماتي»…) is its own view under the same stage.
 */
export function CustomerLibraryPage({ tab }: { tab?: string }) {
  const view = tabs.find(([key]) => key === tab);
  return view ? <LibraryView tab={view[0]} title={view[1]} /> : <LibraryOverview />;
}

function LibraryView({ tab, title }: { tab: CustomerLibraryTab; title: string }) {
  return (
    <div className="stage-page library-page">
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="library-title">
          <div className="content-container stage-head">
            <p className="stage-head__crumbs">
              <Link href="/library">مكتبتي</Link>
            </p>
            <h1 id="library-title" className="stage-head__title">
              {title}
            </h1>
          </div>
        </section>
      </div>
      <div className="home-sheet">
        <div className="home-sheet__surface">
          <CustomerGate bare>
            <div className="content-container customer-page library-view">
              <LibraryContent tab={tab} />
            </div>
          </CustomerGate>
        </div>
      </div>
    </div>
  );
}

/** What the overview shows, with every episode it needs fetched once. */
function useLibraryOverview() {
  const { library } = useCustomer();
  // The newest progress past the player's resume point; finished ones are skipped below.
  const candidates = [...library.progress]
    .filter((item) => item.positionSec >= 15)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  const saved = library.savedEpisodeIds.slice(0, 10);
  const moments = [...library.bookmarks]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const lists = library.playlists.slice(0, 4);
  const ids = [
    ...new Set([
      ...candidates.map((item) => item.episodeId),
      ...saved,
      ...moments.map((item) => item.episodeId),
      ...lists.flatMap((list) => list.episodeIds.slice(0, 4)),
    ]),
  ];
  const result = useCustomerEpisodes(ids);
  const byId = new Map(result.episodes.map((episode) => [episode.id, episode]));
  const showOf = (episode: Episode) => result.shows.find((show) => show.id === episode.showId);
  const found = candidates
    .map((item) => ({ item, episode: byId.get(item.episodeId) }))
    .find(
      ({ item, episode }) =>
        episode && (!episode.durationSec || item.positionSec < episode.durationSec - 5),
    );
  const resume =
    found && found.episode
      ? { episode: found.episode, show: showOf(found.episode), positionSec: found.item.positionSec }
      : null;
  return { ...result, byId, showOf, resume, saved, moments, lists };
}
type LibraryOverviewData = ReturnType<typeof useLibraryOverview>;

function LibraryOverview() {
  const customer = useCustomer();
  const data = useLibraryOverview();
  const resume = customer.user ? data.resume : null;
  const crosses = Boolean(
    resume && !resume.episode.premium && isYouTubeVideoId(resume.episode.youtubeVideoId),
  );
  const done =
    resume && resume.episode.durationSec
      ? Math.min(100, (resume.positionSec / resume.episode.durationSec) * 100)
      : 0;
  return (
    <div className={'stage-page library-page' + (crosses ? ' has-cross' : '')}>
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="library-title">
          <div className="content-container stage-head">
            <h1 id="library-title" className="stage-statement">
              مكتبتي
            </h1>
            <p className="stage-head__lede">ما حفظته وتابعته، في مكان واحد.</p>
          </div>
          {crosses && resume ? (
            <Link
              className="stage-cross library-resume__picture"
              href={`/episodes/${encodeURIComponent(resume.episode.id)}`}
              tabIndex={-1}
              aria-hidden="true"
            >
              <YouTubeStill videoId={resume.episode.youtubeVideoId} priority />
              <span className="library-resume__track">
                <span className="library-resume__done" style={{ width: `${done}%` }} />
              </span>
            </Link>
          ) : null}
        </section>
      </div>
      <div className="home-sheet">
        <div className="home-sheet__surface">
          <CustomerGate bare>
            <LibrarySheet data={data} />
          </CustomerGate>
        </div>
      </div>
    </div>
  );
}

function LibrarySheet({ data }: { data: LibraryOverviewData }) {
  const customer = useCustomer();
  const { library } = customer;
  const [creating, setCreating] = useState(false);
  const apiOrigin = customer.config.apiOrigin;
  if (data.loading)
    return (
      <div className="content-container">
        <ContentSkeleton label="تحميل مكتبتك" variant="cards" />
      </div>
    );
  const savedEpisodes = data.saved
    .map((id) => data.byId.get(id))
    .filter((episode): episode is Episode => Boolean(episode));
  const moments = data.moments.filter((moment) => data.byId.has(moment.episodeId));
  const empty =
    !data.resume &&
    !savedEpisodes.length &&
    !library.followedShowIds.length &&
    !moments.length &&
    !library.savedArticleIds.length &&
    !library.playlists.length;
  const audio = (id: string) =>
    apiOrigin ? `${apiOrigin}/episodes/${encodeURIComponent(id)}/audio` : null;

  return (
    <>
      {empty ? (
        <section className="content-container library-start" aria-labelledby="library-start">
          <h2 className="cover-section__title" id="library-start">
            لم تحفظ شيئًا بعد
          </h2>
          <p className="library-note">احفظ حلقة أو قراءة، أو تابع برنامجًا، وستجده هنا.</p>
          <Link className="public-primary" href="/episodes">
            تصفح الحلقات
          </Link>
        </section>
      ) : null}

      {data.resume ? <LibraryResume resume={data.resume} apiOrigin={apiOrigin} /> : null}

      {savedEpisodes.length ? (
        <section aria-labelledby="library-saved">
          <div className="content-container home-head">
            <h2 className="cover-section__title" id="library-saved">
              المحفوظات
            </h2>
            <div className="home-head__tools">
              <Link className="stage-link" href="/library?tab=saved">
                كل المحفوظات
              </Link>
              <RailControls target="library-saved-rail" label="المحفوظات" />
            </div>
          </div>
          <div
            id="library-saved-rail"
            className="stage-rail stage-rail--episodes"
            role="list"
            tabIndex={0}
            aria-label="حلقات محفوظة"
          >
            {savedEpisodes.map((episode) => {
              const show = data.showOf(episode);
              return (
                <EpisodeCardView
                  key={episode.id}
                  episode={episode}
                  showName={showFace(show).name || undefined}
                  showArtwork={show?.artworkUrl}
                  audioSrc={audio(episode.id)}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {library.followedShowIds.length ? <FollowedOverview /> : null}

      <section className="content-container" aria-labelledby="library-lists">
        <div className="home-head">
          <h2 className="cover-section__title" id="library-lists">
            قوائم التشغيل
          </h2>
          <div className="home-head__tools">
            {library.playlists.length > data.lists.length ? (
              <Link className="stage-link" href="/library?tab=playlists">
                كل القوائم
              </Link>
            ) : null}
            <button type="button" className="library-new" onClick={() => setCreating(true)}>
              <BrandIcon name="plus" />
              قائمة جديدة
            </button>
          </div>
        </div>
        {data.lists.length ? (
          <ul className="library-lists">
            {data.lists.map((list) => (
              <li key={list.id}>
                <Link className="library-list" href={`/playlists/${encodeURIComponent(list.id)}`}>
                  <PlaylistMosaic ids={list.episodeIds.slice(0, 4)} byId={data.byId} />
                  <span className="library-list__name">{list.name}</span>
                  <span className="library-list__count">
                    {episodeCount(list.episodeIds.length)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="library-note">اجمع حلقات تستمع إليها بالترتيب.</p>
        )}
      </section>

      {moments.length ? (
        <section className="content-container" aria-labelledby="library-moments">
          <div className="home-head">
            <h2 className="cover-section__title" id="library-moments">
              لحظاتك
            </h2>
            {library.bookmarks.length > moments.length ? (
              <Link className="stage-link" href="/library?tab=saved">
                كل اللحظات
              </Link>
            ) : null}
          </div>
          <ul className="library-moments">
            {moments.map((moment) => (
              <LibraryMoment
                key={moment.id}
                moment={moment}
                episode={data.byId.get(moment.episodeId)!}
                show={data.showOf(data.byId.get(moment.episodeId)!)}
                apiOrigin={apiOrigin}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {library.savedArticleIds.length ? <SavedReadsOverview /> : null}

      <nav className="content-container" aria-label="المزيد في حسابك">
        <ul className="library-more">
          <li>
            <Link className="stage-link" href="/library?tab=history">
              سجل الاستماع
            </Link>
          </li>
          <li>
            <Link className="stage-link" href="/library?tab=interests">
              اهتماماتي
            </Link>
          </li>
          <li>
            <Link className="stage-link" href="/library/courses">
              دوراتي
            </Link>
          </li>
          <li>
            <Link className="stage-link" href="/account">
              إعدادات الحساب
            </Link>
          </li>
        </ul>
      </nav>

      {creating ? <PlaylistNameDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}

/** The episode the listener stopped in, introduced under its picture. */
function LibraryResume({
  resume,
  apiOrigin,
}: {
  resume: NonNullable<LibraryOverviewData['resume']>;
  apiOrigin: string | null | undefined;
}) {
  const { episode, show, positionSec } = resume;
  const href = `/episodes/${encodeURIComponent(episode.id)}`;
  const name = showFace(show).name;
  const left = formatDuration(Math.max(0, episode.durationSec - positionSec));
  const playable =
    apiOrigin && !episode.premium ? customerPlayerEpisode(episode, show, apiOrigin) : null;
  return (
    <article
      className="content-container stage-feature stage-feature--episode"
      aria-labelledby="library-resume"
    >
      <h2 className="stage-feature__title" id="library-resume">
        <Link href={href}>{episode.titleAr}</Link>
      </h2>
      <p className="library-resume__where">
        {name ? `${name}، ` : ''}الحلقة {formatNumber(episode.episodeNumber)}. وصلت إلى{' '}
        <bdi>{formatPlaybackTime(positionSec)}</bdi>
        {left ? (
          <>
            {' '}
            وبقي <bdi>{left}</bdi>
          </>
        ) : null}
      </p>
      <div className="stage-head__actions">
        {playable ? (
          <>
            <PlayEpisodeButton episode={playable} variant="label" idleLabel="أكمل الاستماع" />
            <EpisodeLibraryActions episode={playable} compact />
          </>
        ) : (
          <Link className="public-primary" href={href}>
            تفاصيل الحلقة
          </Link>
        )}
      </div>
    </article>
  );
}

/** A playlist's first four stills, or its first when it holds fewer. */
function PlaylistMosaic({ ids, byId }: { ids: string[]; byId: Map<string, Episode> }) {
  const stills = ids
    .map((id) => byId.get(id))
    .map((episode) =>
      episode && !episode.premium ? youtubeThumbnailUrl(episode.youtubeVideoId) : null,
    )
    .filter((src): src is string => Boolean(src));
  const shown = stills.length >= 4 ? stills.slice(0, 4) : stills.slice(0, 1);
  return (
    <span
      className={'library-list__art' + (shown.length === 4 ? ' library-list__art--four' : '')}
      aria-hidden="true"
    >
      {shown.map((src, index) => (
        <img key={`${src}-${index}`} src={src} alt="" loading="lazy" decoding="async" />
      ))}
    </span>
  );
}

function LibraryMoment({
  moment,
  episode,
  show,
  apiOrigin,
}: {
  moment: CustomerBookmark;
  episode: Episode;
  show: Show | undefined;
  apiOrigin: string | null | undefined;
}) {
  const name = showFace(show).name;
  const at = Math.floor(moment.positionSec);
  return (
    <li className="library-moment">
      <span className="library-moment__at">
        <bdi>{formatPlaybackTime(at)}</bdi>
      </span>
      <div className="library-moment__body">
        <p className="library-moment__note">{moment.label || episode.titleAr}</p>
        <p className="library-moment__episode">
          {name ? `${name}، ` : ''}الحلقة {formatNumber(episode.episodeNumber)}
          {moment.label ? `: ${episode.titleAr}` : ''}
        </p>
      </div>
      {apiOrigin && !episode.premium ? (
        <PlayEpisodeButton
          episode={customerPlayerEpisode(episode, show, apiOrigin)}
          variant="label"
          initialSeconds={at}
          idleLabel="استمع من هنا"
        />
      ) : (
        <Link className="stage-link" href={`/episodes/${encodeURIComponent(episode.id)}?t=${at}`}>
          افتح الحلقة
        </Link>
      )}
    </li>
  );
}

function useShows() {
  const { publicRead } = useCustomer();
  const [shows, setShows] = useState<Show[] | null>(null);
  useEffect(() => {
    let active = true;
    void publicRead<Show[]>('/shows')
      .then((value) => {
        if (active) setShows(value);
      })
      .catch(() => {
        if (active) setShows([]);
      });
    return () => {
      active = false;
    };
  }, [publicRead]);
  return shows;
}

function FollowedOverview() {
  const customer = useCustomer();
  const shows = useShows();
  const followed = shows
    ? customer.library.followedShowIds
        .map((id) => shows.find((show) => show.id === id))
        .filter((show): show is Show => Boolean(show))
    : [];
  if (shows && !followed.length) return null;
  return (
    <section className="content-container" aria-labelledby="library-follows">
      <div className="home-head">
        <h2 className="cover-section__title" id="library-follows">
          برامج تتابعها
        </h2>
        <Link className="stage-link" href="/programmes">
          تصفح البرامج
        </Link>
      </div>
      {shows ? (
        <ul className="library-follows">
          {followed.map((show) => {
            const face = showFace(show);
            return (
              <li key={show.id} data-tone={face.tone}>
                <Link className="library-follow" href={showHref(show.slug)}>
                  {face.cover ? (
                    <img
                      className="library-follow__cover"
                      src={face.cover}
                      alt=""
                      width={240}
                      height={240}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="library-follow__cover library-follow__blank" />
                  )}
                  <span className="library-follow__name">{face.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ContentSkeleton label="تحميل البرامج" variant="cards" />
      )}
    </section>
  );
}

/** Saved articles by id; a removed article comes back as null. */
function useSavedArticles(articleIds: string[]) {
  const { publicRead } = useCustomer();
  const ids = JSON.stringify(articleIds);
  const [articles, setArticles] = useState<{
    key: string;
    rows: Array<{ id: string; article: PublishedArticle | null }>;
  }>({ key: '', rows: [] });
  useEffect(() => {
    let active = true;
    const parsed = JSON.parse(ids) as string[];
    void Promise.allSettled(
      parsed.map((id) => publicRead<PublishedArticle>(`/articles/id/${encodeURIComponent(id)}`)),
    ).then((results) => {
      if (active)
        setArticles({
          key: ids,
          rows: results.map((result, index) => ({
            id: parsed[index],
            article: result.status === 'fulfilled' ? result.value : null,
          })),
        });
    });
    return () => {
      active = false;
    };
  }, [ids, publicRead]);
  return { rows: articles.rows, loading: articles.key !== ids };
}

function SavedReadsOverview() {
  const customer = useCustomer();
  const ids = customer.library.savedArticleIds;
  const { rows, loading } = useSavedArticles(ids.slice(0, 3));
  const articles = rows
    .map((row) => row.article)
    .filter((article): article is PublishedArticle => Boolean(article)) as TileArticle[];
  if (!loading && !articles.length) return null;
  return (
    <section className="content-container" aria-labelledby="library-reads">
      <div className="home-head">
        <h2 className="cover-section__title" id="library-reads">
          قراءات محفوظة
        </h2>
        {ids.length > 3 ? (
          <Link className="stage-link" href="/library?tab=saved">
            كل المحفوظات
          </Link>
        ) : null}
      </div>
      {loading ? (
        <ContentSkeleton label="تحميل القراءات" variant="cards" />
      ) : (
        <ArticleTiles articles={articles} />
      )}
    </section>
  );
}

function LibraryContent({ tab }: { tab: CustomerLibraryTab }) {
  const customer = useCustomer();
  const [dialog, setDialog] = useState<'playlist' | 'history' | null>(null);
  const [limit, setLimit] = useState(20);
  const episodeIds =
    tab === 'history'
      ? [...customer.library.progress]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((item) => item.episodeId)
      : customer.library.savedEpisodeIds;
  const savedEmpty =
    !customer.library.savedEpisodeIds.length &&
    !customer.library.savedArticleIds.length &&
    !customer.library.bookmarks.length;
  return (
    <>
      {tab === 'saved' &&
        (savedEmpty ? (
          <CustomerEmpty title="لا توجد محفوظات بعد" href="/episodes">
            حفظ حلقة أو قراءة يضيفها إلى المكتبة.
          </CustomerEmpty>
        ) : (
          <>
            <CustomerEpisodeList
              episodeIds={episodeIds.slice(0, limit)}
              onUnavailableRemove={(id) => {
                void customer
                  .toggleSaved('episode', id)
                  .catch((failure) => customer.notify(customerError(failure)));
              }}
            />
            {episodeIds.length > limit && (
              <button
                className="customer-text-button"
                onClick={() => setLimit((value) => value + 20)}
              >
                عرض المزيد
              </button>
            )}
            <SavedArticles />
            <BookmarkList />
          </>
        ))}
      {tab === 'followed' && <FollowedShows />}
      {tab === 'history' &&
        (episodeIds.length ? (
          <>
            <CustomerEpisodeList
              episodeIds={episodeIds.slice(0, limit)}
              onUnavailableRemove={(id) => {
                void customer
                  .mutateLibrary(`/progress/${encodeURIComponent(id)}`, 'DELETE')
                  .catch((failure) => customer.notify(customerError(failure)));
              }}
            />
            {episodeIds.length > limit && (
              <button
                className="customer-text-button"
                onClick={() => setLimit((value) => value + 20)}
              >
                عرض المزيد
              </button>
            )}
            <div className="customer-history-foot">
              <button className="customer-text-button" onClick={() => setDialog('history')}>
                مسح السجل
              </button>
            </div>
          </>
        ) : (
          <CustomerEmpty title="سجل الاستماع فارغ" href="/episodes">
            تشغيل حلقة يضيفها إلى سجل الاستماع.
          </CustomerEmpty>
        ))}
      {tab === 'playlists' && (
        <>
          <div className="customer-playlist-head">
            <button className="customer-primary" onClick={() => setDialog('playlist')}>
              + إنشاء قائمة
            </button>
          </div>
          {customer.library.playlists.length ? (
            <div className="customer-playlist-grid">
              {customer.library.playlists.map((playlist) => (
                <Link
                  key={playlist.id}
                  href={`/playlists/${encodeURIComponent(playlist.id)}`}
                  className="customer-playlist-link"
                >
                  <PlaylistArt playlist={playlist} />
                  <h2>{playlist.name}</h2>
                  <p>{episodeCount(playlist.episodeIds.length)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <CustomerEmpty title="لا توجد قوائم تشغيل بعد">
              إنشاء قائمة يتيح جمع حلقات للاستماع إليها بالترتيب.
            </CustomerEmpty>
          )}
        </>
      )}
      {tab === 'interests' && <CustomerInterestsForm />}
      {dialog === 'playlist' && <PlaylistNameDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && (
        <LibraryConfirm
          title="مسح سجل الاستماع؟"
          action="مسح سجل الاستماع"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await customer.mutateLibrary('/progress', 'DELETE');
            customer.notify('تم مسح سجل الاستماع.');
          }}
        >
          سيُحذف تقدم الاستماع من جميع الأجهزة. تبقى المحفوظات وقوائم التشغيل.
        </LibraryConfirm>
      )}
    </>
  );
}

function FollowedShows() {
  const customer = useCustomer();
  const [shows, setShows] = useState<Show[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void customer
      .publicRead<Show[]>('/shows')
      .then((value) => {
        if (active) setShows(value);
      })
      .catch((failure) => {
        if (active) setError(customerError(failure));
      });
    return () => {
      active = false;
    };
  }, [customer.publicRead]);
  if (!customer.library.followedShowIds.length)
    return (
      <CustomerEmpty title="لا توجد برامج متابعة" href="/shows" action="تصفح البرامج">
        تابع برنامجًا لتصل إلى حلقاته بسهولة.
      </CustomerEmpty>
    );
  if (error)
    return (
      <p className="customer-error" role="alert">
        {error}
      </p>
    );
  if (!shows) return <ContentSkeleton label="تحميل البرامج" variant="cards" />;
  return (
    <div className="customer-program-grid">
      {customer.library.followedShowIds.map((id) => {
        const show = shows.find((item) => item.id === id);
        return (
          <article key={id}>
            {show ? (
              <Link href={`/shows/${encodeURIComponent(show.slug)}`}>
                {show.artworkUrl && (
                  <img src={show.artworkUrl} alt="" width="240" height="240" loading="lazy" />
                )}
                <h2>{show.titleAr}</h2>
              </Link>
            ) : (
              <h2>هذا البرنامج غير متاح الآن</h2>
            )}
            <button
              className="customer-text-button"
              onClick={() => {
                void customer
                  .toggleFollow(id)
                  .catch((failure) => customer.notify(customerError(failure)));
              }}
            >
              إلغاء المتابعة
            </button>
          </article>
        );
      })}
    </div>
  );
}

function SavedArticles() {
  const customer = useCustomer();
  const articles = useSavedArticles(customer.library.savedArticleIds);
  if (!customer.library.savedArticleIds.length) return null;
  return (
    <section className="customer-saved-articles">
      <h2>قراءات محفوظة</h2>
      {!articles.loading ? (
        articles.rows.map(({ id, article }) => (
          <article key={id} className="customer-saved-article">
            {article ? (
              <Link href={`/articles/${encodeURIComponent(article.slug)}`}>
                <h3>{article.titleAr}</h3>
              </Link>
            ) : (
              <h3>هذه القراءة غير متاحة الآن</h3>
            )}
            <button
              className="customer-text-button"
              onClick={() => {
                void customer
                  .toggleSaved('article', id)
                  .catch((failure) => customer.notify(customerError(failure)));
              }}
            >
              إزالة من المحفوظات
            </button>
          </article>
        ))
      ) : (
        <ContentSkeleton label="تحميل القراءات" variant="rows" />
      )}
    </section>
  );
}

function BookmarkList() {
  const customer = useCustomer();
  const ids = [...new Set(customer.library.bookmarks.map((item) => item.episodeId))];
  const { episodes } = useCustomerEpisodes(ids);
  const [edit, setEdit] = useState<CustomerBookmark | null>(null);
  const [remove, setRemove] = useState<CustomerBookmark | null>(null);
  if (!customer.library.bookmarks.length) return null;
  return (
    <section className="customer-bookmarks">
      <h2>لحظات محفوظة</h2>
      {customer.library.bookmarks.map((bookmark) => (
        <article key={bookmark.id} className="customer-bookmark">
          <div>
            <Link
              href={`/episodes/${encodeURIComponent(bookmark.episodeId)}?t=${Math.floor(bookmark.positionSec)}`}
            >
              {episodes.find((episode) => episode.id === bookmark.episodeId)?.titleAr ||
                'العودة إلى الحلقة'}{' '}
              <BrandIcon name="clock" className="metadata-icon" />{' '}
              <bdi>{formatPlaybackTime(bookmark.positionSec)}</bdi>
            </Link>
            {bookmark.label && <p>{bookmark.label}</p>}
          </div>
          <div className="customer-action-row">
            <button className="customer-text-button" onClick={() => setEdit(bookmark)}>
              تعديل الملاحظة
            </button>
            <button
              className="customer-icon-button"
              aria-label="إزالة اللحظة المحفوظة"
              onClick={() => setRemove(bookmark)}
            >
              <CustomerIcon name="close" />
            </button>
          </div>
        </article>
      ))}
      {edit && <BookmarkEdit bookmark={edit} onClose={() => setEdit(null)} />}
      {remove && (
        <LibraryConfirm
          title="إزالة اللحظة المحفوظة؟"
          action="إزالة اللحظة"
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await customer.mutateLibrary(`/bookmarks/${encodeURIComponent(remove.id)}`, 'DELETE');
            customer.notify('تمت إزالة اللحظة المحفوظة.');
          }}
        >
          ستُزال هذه اللحظة وملاحظتها من حسابك.
        </LibraryConfirm>
      )}
    </section>
  );
}

function BookmarkEdit({ bookmark, onClose }: { bookmark: CustomerBookmark; onClose: () => void }) {
  const customer = useCustomer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <CustomerDialog title="ملاحظة اللحظة" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const label = String(new FormData(event.currentTarget).get('label')).trim();
          setBusy(true);
          try {
            await customer.mutateLibrary(`/bookmarks/${encodeURIComponent(bookmark.id)}`, 'PATCH', {
              label,
            });
            customer.notify('تم حفظ الملاحظة.');
            onClose();
          } catch (failure) {
            setError(customerError(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        <CustomerField
          name="label"
          label="الملاحظة"
          defaultValue={bookmark.label}
          maxLength={300}
          hint="اختياري."
        />
        {error && (
          <p role="alert" className="customer-error">
            {error}
          </p>
        )}
        <BusyButton aria-busy={Boolean(busy)} className="customer-primary" disabled={busy}>
          {busy ? 'جار الحفظ…' : 'حفظ الملاحظة'}
        </BusyButton>
      </form>
    </CustomerDialog>
  );
}

export function CustomerInterestsForm({
  onComplete,
  initial = [],
}: {
  onComplete?: (topics: string[]) => Promise<void>;
  initial?: string[];
}) {
  const customer = useCustomer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const values = customer.profile?.interests || initial;
  return (
    <form
      className="customer-interest-form"
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        const topics = new FormData(event.currentTarget).getAll('topics').map(String);
        setBusy(true);
        setError('');
        try {
          await customer.updateProfile({ interests: topics });
          if (onComplete) await onComplete(topics);
          else customer.notify('تم حفظ الاهتمامات.');
        } catch (failure) {
          setError(customerError(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="customer-muted">اختر الموضوعات القريبة منك. يمكنك تغييرها في أي وقت.</p>
      <div className="customer-choices">
        {CUSTOMER_TOPICS.map((topic) => (
          <label className="customer-choice" key={topic}>
            <input
              type="checkbox"
              name="topics"
              value={topic}
              defaultChecked={values.includes(topic)}
            />
            {topic}
          </label>
        ))}
      </div>
      {error && (
        <p className="customer-error" role="alert">
          {error}
        </p>
      )}
      <BusyButton aria-busy={Boolean(busy)} className="customer-primary" disabled={busy}>
        {busy ? 'جار الحفظ…' : onComplete ? 'اختيار البرامج' : 'حفظ الاهتمامات'}
      </BusyButton>
    </form>
  );
}

function PlaylistArt({ playlist }: { playlist: CustomerPlaylist }) {
  const { episodes, shows } = useCustomerEpisodes(playlist.episodeIds.slice(0, 2));
  const images = episodes
    .map((episode) => shows.find((show) => show.id === episode.showId)?.artworkUrl)
    .filter(Boolean) as string[];
  return (
    <div className="customer-playlist-art" aria-hidden="true">
      {images.length ? (
        images.map((url, index) => <img key={`${url}-${index}`} src={url} alt="" loading="lazy" />)
      ) : (
        <>
          <CustomerIcon name="queue" />
          <span>{playlist.episodeIds.length ? 'قائمة تشغيل' : 'قائمة جديدة'}</span>
        </>
      )}
    </div>
  );
}

export function PlaylistNameDialog({
  playlist,
  onClose,
}: {
  playlist?: CustomerPlaylist;
  onClose: () => void;
}) {
  const customer = useCustomer();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateCustomerForm(event.currentTarget);
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    setBusy(true);
    setError('');
    try {
      const previousIds = new Set(customer.library.playlists.map((item) => item.id));
      const library = await customer.mutateLibrary(
        playlist ? `/playlists/${encodeURIComponent(playlist.id)}` : '/playlists',
        playlist ? 'PATCH' : 'POST',
        { name },
      );
      customer.notify(playlist ? 'تم حفظ اسم القائمة.' : 'تم إنشاء القائمة.');
      onClose();
      if (!playlist) {
        const created = library.playlists.find((item) => !previousIds.has(item.id));
        if (created) router.push(`/playlists/${encodeURIComponent(created.id)}`);
      }
    } catch (failure) {
      setError(customerError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <CustomerDialog title={playlist ? 'تعديل اسم القائمة' : 'قائمة تشغيل جديدة'} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <CustomerField
          name="name"
          label="اسم القائمة"
          defaultValue={playlist?.name || ''}
          required
          maxLength={100}
          error={errors.name}
        />
        {error && (
          <p className="customer-error" role="alert">
            {error}
          </p>
        )}
        <BusyButton aria-busy={Boolean(busy)} className="customer-primary" disabled={busy}>
          {busy ? 'جار الحفظ…' : playlist ? 'حفظ الاسم' : 'إنشاء القائمة'}
        </BusyButton>
      </form>
    </CustomerDialog>
  );
}

export function CustomerPlaylistPage({ playlistId }: { playlistId: string }) {
  return (
    <CustomerGate>
      <PlaylistContent playlistId={playlistId} />
    </CustomerGate>
  );
}

function PlaylistContent({ playlistId }: { playlistId: string }) {
  const customer = useCustomer();
  const player = usePlayer();
  const router = useRouter();
  const playlist = customer.library.playlists.find((item) => item.id === playlistId);
  const { episodes, shows, loading, error } = useCustomerEpisodes(playlist?.episodeIds || []);
  const playableEpisodes = loading || error ? [] : episodes.filter((episode) => !episode.premium);
  const [dialog, setDialog] = useState<'rename' | 'add' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  if (!playlist)
    return (
      <div className="page customer-page">
        <CustomerEmpty
          title="قائمة التشغيل غير متاحة"
          href="/library?tab=playlists"
          action="قوائم التشغيل"
        >
          ربما حُذفت القائمة أو أنها مرتبطة بحساب آخر.
        </CustomerEmpty>
      </div>
    );

  async function reorder(id: string, direction: number) {
    if (!playlist || busy) return;
    const ids = [...playlist.episodeIds];
    const index = ids.indexOf(id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    setPendingAction(`${direction}:${id}`);
    try {
      await customer.mutateLibrary(`/playlists/${encodeURIComponent(playlistId)}`, 'PATCH', {
        episodeIds: ids,
      });
      customer.notify('تم حفظ ترتيب الحلقات.');
    } catch (failure) {
      customer.notify(customerError(failure));
    } finally {
      setBusy(false);
      setPendingAction('');
    }
  }

  async function remove(id: string) {
    if (!playlist || busy) return;
    setBusy(true);
    setPendingAction(`remove:${id}`);
    try {
      await customer.mutateLibrary(`/playlists/${encodeURIComponent(playlistId)}`, 'PATCH', {
        episodeIds: playlist.episodeIds.filter((item) => item !== id),
      });
      customer.notify('تمت إزالة الحلقة من القائمة.');
    } catch (failure) {
      customer.notify(customerError(failure));
    } finally {
      setBusy(false);
      setPendingAction('');
    }
  }

  return (
    <div className="page customer-page">
      <Link className="customer-form-link" href="/library?tab=playlists">
        قوائم التشغيل
      </Link>
      <header className="customer-playlist-detail-head">
        <PlaylistArt playlist={playlist} />
        <div>
          <h1>{playlist.name}</h1>
          <p>{episodeCount(playlist.episodeIds.length)}</p>
          <div className="customer-action-row">
            {!!playableEpisodes.length && customer.config.apiOrigin && (
              <button
                className="customer-primary"
                onClick={async () => {
                  if (!customer.config.apiOrigin) return;
                  try {
                    await customer.updateQueue(playableEpisodes.slice(1).map((item) => item.id));
                    const first = playableEpisodes[0];
                    player.toggle(
                      customerPlayerEpisode(
                        first,
                        shows.find((show) => show.id === first.showId),
                        customer.config.apiOrigin,
                      ),
                    );
                  } catch (failure) {
                    customer.notify(customerError(failure));
                  }
                }}
              >
                <CustomerIcon name="play" />
                تشغيل القائمة
              </button>
            )}
            <button className="customer-text-button" onClick={() => setDialog('rename')}>
              تعديل الاسم
            </button>
            <button className="customer-text-button" onClick={() => setDialog('add')}>
              إضافة حلقة
            </button>
          </div>
        </div>
      </header>
      {loading ? (
        <ContentSkeleton label="تحميل الحلقات" variant="rows" />
      ) : error ? (
        <p role="alert" className="customer-error">
          {error}
        </p>
      ) : playlist.episodeIds.length ? (
        playlist.episodeIds.map((id, index) => {
          const episode = episodes.find((item) => item.id === id);
          return (
            <div className="customer-playlist-row" key={id}>
              <span className="customer-playlist-number">{index + 1}</span>
              {episode ? (
                <CustomerEpisodeRow
                  episode={episode}
                  show={shows.find((show) => show.id === episode.showId)}
                />
              ) : (
                <p>هذه الحلقة غير متاحة الآن.</p>
              )}
              <div className="customer-playlist-tools">
                <BusyButton
                  aria-busy={pendingAction === `-1:${id}`}
                  className="customer-icon-button"
                  disabled={busy || index === 0}
                  aria-label={`نقل ${episode?.titleAr || 'الحلقة'} للأعلى`}
                  onClick={() => void reorder(id, -1)}
                >
                  <CustomerIcon name="up" />
                </BusyButton>
                <BusyButton
                  aria-busy={pendingAction === `1:${id}`}
                  className="customer-icon-button"
                  disabled={busy || index === playlist.episodeIds.length - 1}
                  aria-label={`نقل ${episode?.titleAr || 'الحلقة'} للأسفل`}
                  onClick={() => void reorder(id, 1)}
                >
                  <CustomerIcon name="down" />
                </BusyButton>
                <BusyButton
                  aria-busy={pendingAction === `remove:${id}`}
                  className="customer-icon-button"
                  disabled={busy}
                  aria-label={`إزالة ${episode?.titleAr || 'الحلقة'} من القائمة`}
                  onClick={() => void remove(id)}
                >
                  <CustomerIcon name="close" />
                </BusyButton>
              </div>
            </div>
          );
        })
      ) : (
        <CustomerEmpty title="لا توجد حلقات في القائمة">
          اختيار «إضافة حلقة» يفتح البحث في الحلقات.
        </CustomerEmpty>
      )}
      <div className="customer-history-foot">
        <button className="customer-text-button" onClick={() => setDialog('delete')}>
          حذف القائمة
        </button>
      </div>
      {dialog === 'rename' && (
        <PlaylistNameDialog playlist={playlist} onClose={() => setDialog(null)} />
      )}
      {dialog === 'add' && <PlaylistPicker playlist={playlist} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <LibraryConfirm
          title="حذف قائمة التشغيل؟"
          action="حذف القائمة"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await customer.mutateLibrary(`/playlists/${encodeURIComponent(playlist.id)}`, 'DELETE');
            customer.notify('تم حذف القائمة.');
            router.replace('/library?tab=playlists');
          }}
        >
          سيتم حذف قائمة «{playlist.name}». تبقى حلقاتها متاحة للاستماع.
        </LibraryConfirm>
      )}
    </div>
  );
}

function PlaylistPicker({
  playlist,
  onClose,
}: {
  playlist: CustomerPlaylist;
  onClose: () => void;
}) {
  const customer = useCustomer();
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<PaginatedList<Episode> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEpisode, setPendingEpisode] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void customer
        .publicRead<PaginatedList<Episode>>(
          `/episodes?page=${page}&perPage=12&search=${encodeURIComponent(search.trim())}`,
        )
        .then((value) => {
          if (active) {
            setResult(value);
            setError('');
          }
        })
        .catch((failure) => {
          if (active) setError(customerError(failure));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, search, customer.publicRead]);
  const current = customer.library.playlists.find((item) => item.id === playlist.id) || playlist;
  return (
    <CustomerDialog title="إضافة حلقة إلى القائمة" onClose={onClose}>
      <div className="customer-interest-form">
        <CustomerField
          name="search"
          label="البحث عن حلقة"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {error && (
          <p role="alert" className="customer-error">
            {error}
          </p>
        )}
        {loading ? (
          <ContentSkeleton label="البحث" variant="rows" />
        ) : (
          <div className="customer-picker-list">
            {result?.items.map((episode) => {
              const added = current.episodeIds.includes(episode.id);
              return (
                <div className="customer-picker-result" key={episode.id}>
                  <h3>{episode.titleAr}</h3>
                  <BusyButton
                    aria-busy={busy && pendingEpisode === episode.id}
                    className="customer-text-button"
                    disabled={busy || added}
                    onClick={async () => {
                      setBusy(true);
                      setPendingEpisode(episode.id);
                      try {
                        await customer.mutateLibrary(
                          `/playlists/${encodeURIComponent(playlist.id)}`,
                          'PATCH',
                          { episodeIds: [...current.episodeIds, episode.id] },
                        );
                        customer.notify('تمت إضافة الحلقة إلى القائمة.');
                      } catch (failure) {
                        setError(customerError(failure));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {added ? 'مضافة' : 'إضافة'}
                  </BusyButton>
                </div>
              );
            })}
            {!result?.items.length && <p>لا توجد حلقات مطابقة. حاول البحث بكلمة أخرى.</p>}
          </div>
        )}
        <div className="customer-action-row">
          <button
            className="customer-text-button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            السابق
          </button>
          <span className="customer-muted">{page}</span>
          <button
            className="customer-text-button"
            disabled={!result?.pageInfo.hasNextPage || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            التالي
          </button>
        </div>
      </div>
    </CustomerDialog>
  );
}

function LibraryConfirm({
  title,
  action,
  children,
  onClose,
  onConfirm,
}: {
  title: string;
  action: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <CustomerDialog
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>{children}</p>
      {error && (
        <p className="customer-error" role="alert">
          {error}
        </p>
      )}
      <div className="customer-action-row">
        <BusyButton
          aria-busy={Boolean(busy)}
          className="customer-primary customer-destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (failure) {
              setError(customerError(failure));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'جار الحذف…' : action}
        </BusyButton>
        <button className="customer-text-button" disabled={busy} onClick={onClose}>
          إلغاء
        </button>
      </div>
    </CustomerDialog>
  );
}
