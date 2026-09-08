'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  CustomerBookmark,
  CustomerPlaylist,
  Episode,
  PaginatedList,
  PublishedArticle,
  Show,
} from '@mukhtalif/types';
import { CUSTOMER_TOPICS, customerError, episodeCount } from '@/lib/customer-utils';
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
import { usePlayer } from './player';
import { formatPlaybackTime } from './player-utils';

const tabs = [
  ['saved', 'المحفوظات'],
  ['followed', 'أتابعها'],
  ['history', 'سجل الاستماع'],
  ['playlists', 'قوائم التشغيل'],
  ['interests', 'اهتماماتي'],
] as const;
export type CustomerLibraryTab = (typeof tabs)[number][0];

export function CustomerLibraryPage({ tab = 'saved' }: { tab?: string }) {
  const activeTab = tabs.some(([key]) => key === tab) ? (tab as CustomerLibraryTab) : 'saved';
  return (
    <CustomerGate>
      <div className="page customer-page">
        <header className="customer-page-head">
          <h1>مكتبتك</h1>
          <p>ما حفظته وتابعته، في مكان واحد.</p>
        </header>
        <nav className="customer-library-tabs" aria-label="أقسام المكتبة">
          {tabs.map(([key, title]) => (
            <Link
              key={key}
              href={key === 'saved' ? '/library' : `/library?tab=${key}`}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              {title}
            </Link>
          ))}
        </nav>
        <LibraryContent tab={activeTab} />
      </div>
    </CustomerGate>
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
          <CustomerEmpty title="مساحة لما تريد العودة إليه" href="/episodes">
            احفظ حلقة أو قراءة، وستجدها هنا.
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
          <CustomerEmpty title="لم تبدأ الاستماع بعد" href="/episodes">
            يظهر تقدمك هنا بعد تشغيل حلقة.
          </CustomerEmpty>
        ))}
      {tab === 'playlists' && (
        <>
          <div className="customer-playlist-head">
            <button className="customer-primary" onClick={() => setDialog('playlist')}>
              + قائمة جديدة
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
            <CustomerEmpty title="قائمتك الأولى تنتظر فكرتك">
              اجمع حلقات الرحلة، أو وقت المشي، أو موضوعًا تود استكشافه.
            </CustomerEmpty>
          )}
        </>
      )}
      {tab === 'interests' && <CustomerInterestsForm />}
      {dialog === 'playlist' && <PlaylistNameDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && (
        <LibraryConfirm
          title="مسح سجل الاستماع؟"
          action="امسح السجل"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await customer.mutateLibrary('/progress', 'DELETE');
            customer.notify('مسحنا سجل الاستماع.');
          }}
        >
          سنمسح تقدم الاستماع من حسابك على كل أجهزتك. ستبقى محفوظاتك وقوائمك.
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
      <CustomerEmpty title="صوت تود متابعته؟" href="/shows" action="استكشف البرامج">
        تابع برنامجًا لتصل إلى حلقاته بسهولة.
      </CustomerEmpty>
    );
  if (error)
    return (
      <p className="customer-error" role="alert">
        {error}
      </p>
    );
  if (!shows) return <p role="status">جارٍ تحميل البرامج…</p>;
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
  const ids = JSON.stringify(customer.library.savedArticleIds);
  const [articles, setArticles] = useState<{
    key: string;
    rows: Array<{ id: string; article: PublishedArticle | null }>;
  }>({ key: '', rows: [] });
  useEffect(() => {
    let active = true;
    const parsed = JSON.parse(ids) as string[];
    void Promise.allSettled(
      parsed.map((id) =>
        customer.publicRead<PublishedArticle>(`/articles/id/${encodeURIComponent(id)}`),
      ),
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
  }, [ids, customer.publicRead]);
  if (!customer.library.savedArticleIds.length) return null;
  return (
    <section className="customer-saved-articles">
      <h2>قراءات محفوظة</h2>
      {articles.key === ids ? (
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
        <p role="status">جارٍ تحميل القراءات…</p>
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
              · <bdi>{formatPlaybackTime(bookmark.positionSec)}</bdi>
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
            customer.notify('أزلنا اللحظة من مكتبتك.');
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
            customer.notify('حفظنا الملاحظة.');
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
        <button className="customer-primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'احفظ الملاحظة'}
        </button>
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
          else customer.notify('حفظنا اهتماماتك.');
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
      <button className="customer-primary" disabled={busy}>
        {busy ? 'جارٍ الحفظ…' : onComplete ? 'التالي: اختر برامجك' : 'احفظ اهتماماتي'}
      </button>
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
      customer.notify(playlist ? 'حفظنا اسم القائمة.' : 'أنشأنا قائمتك.');
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
        <button className="customer-primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : playlist ? 'احفظ الاسم' : 'أنشئ القائمة'}
        </button>
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
  if (!playlist)
    return (
      <div className="page customer-page">
        <CustomerEmpty
          title="لم نجد هذه القائمة"
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
    try {
      await customer.mutateLibrary(`/playlists/${encodeURIComponent(playlistId)}`, 'PATCH', {
        episodeIds: ids,
      });
      customer.notify('حفظنا ترتيب الحلقات.');
    } catch (failure) {
      customer.notify(customerError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!playlist || busy) return;
    setBusy(true);
    try {
      await customer.mutateLibrary(`/playlists/${encodeURIComponent(playlistId)}`, 'PATCH', {
        episodeIds: playlist.episodeIds.filter((item) => item !== id),
      });
      customer.notify('أزلنا الحلقة من القائمة.');
    } catch (failure) {
      customer.notify(customerError(failure));
    } finally {
      setBusy(false);
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
                شغّل القائمة
              </button>
            )}
            <button className="customer-text-button" onClick={() => setDialog('rename')}>
              تعديل الاسم
            </button>
            <button className="customer-text-button" onClick={() => setDialog('add')}>
              أضف حلقة
            </button>
          </div>
        </div>
      </header>
      {loading ? (
        <p role="status">جارٍ تحميل الحلقات…</p>
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
                <button
                  className="customer-icon-button"
                  disabled={busy || index === 0}
                  aria-label={`نقل ${episode?.titleAr || 'الحلقة'} للأعلى`}
                  onClick={() => void reorder(id, -1)}
                >
                  <CustomerIcon name="up" />
                </button>
                <button
                  className="customer-icon-button"
                  disabled={busy || index === playlist.episodeIds.length - 1}
                  aria-label={`نقل ${episode?.titleAr || 'الحلقة'} للأسفل`}
                  onClick={() => void reorder(id, 1)}
                >
                  <CustomerIcon name="down" />
                </button>
                <button
                  className="customer-icon-button"
                  disabled={busy}
                  aria-label={`إزالة ${episode?.titleAr || 'الحلقة'} من القائمة`}
                  onClick={() => void remove(id)}
                >
                  <CustomerIcon name="close" />
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <CustomerEmpty title="القائمة تنتظر أول حلقة">اختر «أضف حلقة» لتبدأ قائمتك.</CustomerEmpty>
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
          action="احذف القائمة"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await customer.mutateLibrary(`/playlists/${encodeURIComponent(playlist.id)}`, 'DELETE');
            customer.notify('حذفنا القائمة.');
            router.replace('/library?tab=playlists');
          }}
        >
          سنحذف قائمة «{playlist.name}». ستبقى الحلقات نفسها متاحة للاستماع.
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
    <CustomerDialog title="أضف حلقة إلى القائمة" onClose={onClose}>
      <div className="customer-interest-form">
        <CustomerField
          name="search"
          label="ابحث عن حلقة"
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
          <p role="status">جارٍ البحث…</p>
        ) : (
          <div className="customer-picker-list">
            {result?.items.map((episode) => {
              const added = current.episodeIds.includes(episode.id);
              return (
                <div className="customer-picker-result" key={episode.id}>
                  <h3>{episode.titleAr}</h3>
                  <button
                    className="customer-text-button"
                    disabled={busy || added}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await customer.mutateLibrary(
                          `/playlists/${encodeURIComponent(playlist.id)}`,
                          'PATCH',
                          { episodeIds: [...current.episodeIds, episode.id] },
                        );
                        customer.notify('أضفنا الحلقة إلى القائمة.');
                      } catch (failure) {
                        setError(customerError(failure));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {added ? 'مضافة' : 'أضف'}
                  </button>
                </div>
              );
            })}
            {!result?.items.length && <p>لم نجد حلقات. جرّب كلمة أخرى.</p>}
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
        <button
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
          {busy ? 'جارٍ الحذف…' : action}
        </button>
        <button className="customer-text-button" disabled={busy} onClick={onClose}>
          إلغاء
        </button>
      </div>
    </CustomerDialog>
  );
}
