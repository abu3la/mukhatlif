import type { Metadata } from 'next';
import Link from 'next/link';
import type { Episode, PaginatedList, PublicGuest, PublishedArticle, Show } from '@mukhtalif/types';
import { ArticleTiles } from '@/components/article-tile';
import { BrandIcon } from '@/components/brand-icon';
import { EpisodeCard } from '@/components/cards';
import { EPISODES_NOUN, RESULTS_NOUN, countInWords } from '@/components/formatting';
import { ProgrammeTile, presenterLine } from '@/components/home-stage';
import { RailControls } from '@/components/public-content-controls';
import { ErrorState } from '@/components/states';
import { ApiUnavailableError, listArticles, listEpisodes, listGuests, listShows } from '@/lib/api';
import { COMMUNITIES, showFace } from '@/lib/communities';
import { singleQuery } from '@/lib/public-content';

export const metadata: Metadata = {
  title: 'البحث',
  description: 'ابحث في برامج مختلف وحلقاتها وضيوفها وقراءاتها.',
  robots: { index: false, follow: true },
};

const KINDS = [
  ['all', 'الكل'],
  ['episodes', 'الحلقات'],
  ['shows', 'البرامج'],
  ['guests', 'الضيوف'],
  ['articles', 'القراءات'],
] as const;
type Kind = (typeof KINDS)[number][0];

const TOPICS = ['المهن', 'الصحة', 'التقنية', 'الثقافة', 'المجتمع'];

/** Letters compared without diacritics or the shapes of alif. */
const normalized = (value: string) =>
  value.normalize('NFKD').replace(/[ً-ٟ]/g, '').replace(/[أإآ]/g, 'ا').toLowerCase();

interface Results {
  episodes: PaginatedList<Episode>;
  guests: PaginatedList<PublicGuest>;
  articles: PaginatedList<PublishedArticle>;
  programmes: (typeof COMMUNITIES)[number]['programmes'];
  shows: Show[];
}

async function find(search: string): Promise<Results | null> {
  try {
    const [shows, episodes, guests, articles] = await Promise.all([
      listShows(),
      listEpisodes({ search, perPage: 6 }),
      listGuests({ search, perPage: 6 }),
      listArticles({ search, perPage: 6 }),
    ]);
    const needle = normalized(search);
    // The programmes are the 27 of the communities (D-24), found by name, line or hosts.
    const programmes = COMMUNITIES.flatMap((community) => community.programmes).filter(
      (programme) =>
        normalized(
          [programme.name, programme.description, presenterLine(programme)].join(' '),
        ).includes(needle),
    );
    return { episodes, guests, articles, programmes, shows };
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return null;
  }
}

/**
 * Search on the presentation site (D-24). The question and its field stand on
 * the night stage with the kinds of result, and their counts, at its edge; the
 * answers follow on the sheet by kind.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = singleQuery(params.q);
  const requestedType = singleQuery(params.type);
  const type: Kind = KINDS.some(([id]) => id === requestedType) ? (requestedType as Kind) : 'all';
  const results = search ? await find(search) : null;

  const counts: Record<Exclude<Kind, 'all'>, number> = {
    episodes: results?.episodes.pageInfo.total ?? 0,
    shows: results?.programmes.length ?? 0,
    guests: results?.guests.pageInfo.total ?? 0,
    articles: results?.articles.pageInfo.total ?? 0,
  };
  const has = (kind: Exclude<Kind, 'all'>) => (type === 'all' || type === kind) && counts[kind] > 0;
  const found = counts.episodes + counts.shows + counts.guests + counts.articles;
  const total = type === 'all' ? found : counts[type];
  const showsById = new Map(results?.shows.map((show) => [show.id, show]) ?? []);
  const kindHref = (kind: Kind) =>
    '/search?q=' + encodeURIComponent(search) + (kind === 'all' ? '' : '&type=' + kind);

  const topics = (
    <ul className="stage-topics">
      {TOPICS.map((topic) => (
        <li key={topic}>
          <Link className="stage-link" href={'/search?q=' + encodeURIComponent(topic)}>
            {topic}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="stage-page search-page">
      <div className="stage-scope">
        <section className="stage-intro search-stage" aria-labelledby="search-title">
          <div className="content-container stage-head">
            <h1 id="search-title" className="stage-statement">
              ما الذي يشغلك؟
            </h1>
            <form className="search-field" action="/search" role="search">
              <label htmlFor="search">ابحث عن حلقة، برنامج، أو ضيف</label>
              <div className="search-field__box">
                <input
                  id="search"
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder="مثلًا: الفضاء"
                  maxLength={160}
                />
                {type !== 'all' ? <input type="hidden" name="type" value={type} /> : null}
                <button type="submit" aria-label="ابحث">
                  <BrandIcon name="search" />
                </button>
              </div>
            </form>
            {results ? (
              <p className="search-count">
                {total ? countInWords(total, RESULTS_NOUN) : 'لا نتائج'} للبحث عن «{search}»
              </p>
            ) : null}
          </div>
          {results && found ? (
            <nav className="search-kinds" aria-label="نوع نتائج البحث">
              <ul>
                {KINDS.map(([id, label]) => {
                  const count = id === 'all' ? found : counts[id];
                  return (
                    <li key={id}>
                      <Link
                        href={kindHref(id)}
                        aria-current={id === type ? 'page' : undefined}
                        data-empty={count === 0 || undefined}
                      >
                        {label}
                        <bdi>{count}</bdi>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {!search ? (
            <section className="content-container" aria-labelledby="search-topics">
              <h2 className="cover-section__title" id="search-topics">
                ابدأ بموضوع
              </h2>
              {topics}
            </section>
          ) : !results ? (
            <div className="content-container">
              <ErrorState title="تعذّر البحث الآن" text="حاول مرة أخرى بعد قليل." />
            </div>
          ) : !total ? (
            <section className="content-container" aria-labelledby="search-none">
              <h2 className="cover-section__title" id="search-none">
                لم نجد نتائج لـ«{search}»
              </h2>
              <p className="search-hint">جرّب اسم ضيف أو برنامج، أو ابحث بكلمة أقصر.</p>
              {topics}
            </section>
          ) : (
            <>
              {has('episodes') ? (
                <section aria-labelledby="search-episodes">
                  <div className="content-container home-head">
                    <h2 className="cover-section__title" id="search-episodes">
                      الحلقات
                    </h2>
                    <div className="home-head__tools">
                      {counts.episodes > results.episodes.items.length ? (
                        <Link
                          className="stage-link"
                          href={'/episodes?search=' + encodeURIComponent(search) + '#all'}
                        >
                          كل الحلقات المطابقة
                        </Link>
                      ) : null}
                      <RailControls target="search-episodes-rail" label="الحلقات" />
                    </div>
                  </div>
                  <div
                    id="search-episodes-rail"
                    className="stage-rail stage-rail--episodes"
                    role="list"
                    tabIndex={0}
                    aria-label={`حلقات عن ${search}`}
                  >
                    {results.episodes.items.map((episode) => {
                      const show = showsById.get(episode.showId);
                      return (
                        <EpisodeCard
                          key={episode.id}
                          episode={episode}
                          showName={showFace(show).name || undefined}
                          showArtwork={show?.artworkUrl}
                        />
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {has('shows') ? (
                <section className="content-container" aria-labelledby="search-programmes">
                  <h2 className="cover-section__title" id="search-programmes">
                    البرامج
                  </h2>
                  <ul className="community-programmes">
                    {results.programmes.map((programme) => (
                      <ProgrammeTile key={programme.slug} programme={programme} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {has('guests') ? (
                <section className="content-container" aria-labelledby="search-guests">
                  <div className="home-head">
                    <h2 className="cover-section__title" id="search-guests">
                      الضيوف
                    </h2>
                    {counts.guests > results.guests.items.length ? (
                      <Link
                        className="stage-link"
                        href={'/guests?search=' + encodeURIComponent(search)}
                      >
                        كل الضيوف المطابقين
                      </Link>
                    ) : null}
                  </div>
                  <ul className="search-guests">
                    {results.guests.items.map((guest) => {
                      const details = [guest.role, guest.city].filter(Boolean).join('، ');
                      return (
                        <li key={guest.id}>
                          <Link
                            className="search-guest"
                            href={`/guests/${encodeURIComponent(guest.slug)}`}
                          >
                            <span className="search-guest__name">{guest.name}</span>
                            {/* Every guest keeps a two-line slot, so each row shares its lines. */}
                            <span className="search-guest__role" aria-hidden={!details}>
                              {details || ' '}
                            </span>
                            <span className="search-guest__count" aria-hidden={!guest.episodeCount}>
                              {guest.episodeCount
                                ? countInWords(guest.episodeCount, EPISODES_NOUN)
                                : ' '}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {has('articles') ? (
                <section className="content-container" aria-labelledby="search-articles">
                  <div className="home-head">
                    <h2 className="cover-section__title" id="search-articles">
                      القراءات
                    </h2>
                    {counts.articles > results.articles.items.length ? (
                      <Link
                        className="stage-link"
                        href={'/articles?search=' + encodeURIComponent(search)}
                      >
                        كل القراءات المطابقة
                      </Link>
                    ) : null}
                  </div>
                  <ArticleTiles articles={results.articles.items} />
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
