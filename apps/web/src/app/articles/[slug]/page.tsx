import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Episode, PublishedArticle } from '@mukhtalif/types';
import { dateTimeAttribute, formatDate } from '@/components/formatting';
import {
  ApiUnavailableError,
  NotFoundError,
  getArticle,
  listArticles,
  listEpisodes,
} from '@/lib/api';
import { absoluteUrl, apiOrigin } from '@/lib/config';
import { ArticleTiles } from '@/components/article-tile';
import { EpisodeCard } from '@/components/cards';
import { ArticleLibraryActions } from '@/components/customer-content';
import { NewsletterSignup } from '@/components/newsletter-signup';
import {
  RailControls,
  ReadingSizeControl,
  ShareButton,
} from '@/components/public-content-controls';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

async function loadArticle(slug: string): Promise<PublishedArticle> {
  try {
    return await getArticle(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  let article: PublishedArticle;
  try {
    // Deliberately not loadArticle: notFound() throws a control-flow signal that
    // a catch here would swallow, leaving the 404 page wearing an article title.
    article = await getArticle(slug);
  } catch (error) {
    if (error instanceof NotFoundError) return { title: 'الصفحة غير موجودة' };
    return { title: 'المقال' };
  }

  const title = article.seo.title ?? article.titleAr;
  const description = article.seo.description ?? article.excerptAr;
  const social = article.seo.socialImageUrl ?? article.coverUrl;
  return {
    title,
    description,
    /*
     * The canonical link is built from PUBLIC_WEB_URL, the same origin the
     * Worker uses for the absolute links in a sent newsletter. Keeping one
     * source means an already-delivered email and this page never disagree.
     */
    alternates: { canonical: article.seo.canonicalUrl ?? absoluteUrl(`/articles/${article.slug}`) },
    robots: article.seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'article',
      title: article.seo.socialTitle ?? title,
      description: article.seo.socialDescription ?? description,
      url: absoluteUrl(`/articles/${article.slug}`),
      publishedTime: article.publishedAt,
      images: social ? [social] : undefined,
    },
  };
}

/**
 * An article of the presentation site (D-24). Its title stands on the night
 * stage and its cover crosses onto the sheet, where the body is read at a
 * reading measure; more reading, the latest conversation and the newsletter
 * follow.
 */
export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  // Both shelves are optional: an unavailable catalogue leaves the article readable.
  const [articles, episodes] = await Promise.allSettled([
    listArticles({ page: 1, perPage: 4 }),
    listEpisodes({ perPage: 6 }),
  ]);
  for (const result of [articles, episodes]) {
    if (result.status === 'rejected' && !(result.reason instanceof ApiUnavailableError)) {
      throw result.reason;
    }
  }
  const more: PublishedArticle[] =
    articles.status === 'fulfilled'
      ? articles.value.items.filter((item) => item.slug !== article.slug).slice(0, 3)
      : [];
  const latestEpisodes: Episode[] = episodes.status === 'fulfilled' ? episodes.value.items : [];

  const byline = `بقلم ${article.author.displayName}`;

  return (
    <div className={'stage-page reading-page' + (article.coverUrl ? ' has-cross' : '')}>
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="article-title">
          <div className="content-container stage-head">
            <p className="stage-head__crumbs">
              <Link href="/articles">اقرأ من مختلف</Link>
              {article.publishedAt ? (
                <time
                  className="stage-head__accent"
                  dateTime={dateTimeAttribute(article.publishedAt)}
                >
                  {formatDate(article.publishedAt)}
                </time>
              ) : null}
            </p>
            <h1 id="article-title" className="stage-head__title">
              {article.titleAr}
            </h1>
            {article.excerptAr ? <p className="stage-head__lede">{article.excerptAr}</p> : null}
            {article.authorPlacement === 'after_title' ? (
              <p className="stage-head__meta stage-head__strong">{byline}</p>
            ) : null}
            <div className="stage-head__actions">
              <ReadingSizeControl />
              <ArticleLibraryActions articleId={article.id} />
              <ShareButton
                title={article.titleAr}
                path={'/articles/' + encodeURIComponent(article.slug)}
              />
            </div>
          </div>
          {article.coverUrl ? (
            /* A plain img for the same reason as the listing cards: cover hosts are
               not known ahead of time and must not be allowlisted with a wildcard. */
            <div className="stage-cross">
              <img
                src={article.coverUrl}
                alt={article.coverAlt ?? ''}
                fetchPriority="high"
                decoding="async"
              />
            </div>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <div className="content-container article-read">
            {/*
              The body is HTML the API rendered itself from validated editor JSON.
              Per ADR 0006 the API never accepts client-supplied HTML as canonical
              content, so this is server-generated trusted output — the site never
              renders markup that came from a browser.
            */}
            <div
              id="article-body"
              className="article-detail__body prose"
              dangerouslySetInnerHTML={{ __html: article.contentHtml }}
            />
            {article.authorPlacement === 'end' ? (
              <p className="article-read__by">{byline}</p>
            ) : null}
          </div>

          {more.length ? (
            <section className="content-container" aria-labelledby="article-more">
              <h2 className="cover-section__title" id="article-more">
                اقرأ أيضًا
              </h2>
              <ArticleTiles articles={more} />
            </section>
          ) : null}

          {latestEpisodes.length ? (
            <section aria-labelledby="article-episodes">
              <div className="content-container home-head">
                <h2 className="cover-section__title" id="article-episodes">
                  ومن القراءة إلى الحوار
                </h2>
                <div className="home-head__tools">
                  <Link className="stage-link" href="/episodes">
                    كل الحلقات
                  </Link>
                  <RailControls target="article-episodes-rail" label="الحلقات" />
                </div>
              </div>
              <div
                id="article-episodes-rail"
                className="stage-rail stage-rail--episodes"
                role="list"
                tabIndex={0}
                aria-label="أحدث حلقات مختلف"
              >
                {latestEpisodes.map((episode) => (
                  <EpisodeCard key={episode.id} episode={episode} />
                ))}
              </div>
            </section>
          ) : null}

          <div className="content-container home-newsletter">
            <NewsletterSignup apiOrigin={apiOrigin()} />
          </div>
        </div>
      </div>
    </div>
  );
}
