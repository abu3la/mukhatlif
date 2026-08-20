import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublishedArticle } from '@mukhtalif/types';
import { dateTimeAttribute, formatDate } from '@/components/formatting';
import { NotFoundError, getArticle } from '@/lib/api';
import { absoluteUrl } from '@/lib/config';

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

function Byline({ article }: { article: PublishedArticle }) {
  return (
    <p className="article__byline">
      {article.author.displayName}
      {article.publishedAt ? (
        <>
          {' · '}
          <time dateTime={dateTimeAttribute(article.publishedAt)}>
            {formatDate(article.publishedAt)}
          </time>
        </>
      ) : null}
    </p>
  );
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await loadArticle(slug);

  return (
    <article className="shell article">
      <header className="article__header">
        <h1 className="article__title">{article.titleAr}</h1>
        {article.authorPlacement === 'after_title' ? <Byline article={article} /> : null}
        {article.excerptAr ? (
          <p className="hero__lede" style={{ marginBlockStart: 'var(--space-md)' }}>
            {article.excerptAr}
          </p>
        ) : null}
      </header>

      {article.coverUrl ? (
        /* A plain img for the same reason as the listing cards: cover hosts are
           not known ahead of time and must not be allowlisted with a wildcard. */
        <img
          className="article__cover"
          src={article.coverUrl}
          alt={article.coverAlt ?? ''}
          decoding="async"
        />
      ) : null}

      {/*
        The body is HTML the API rendered itself from validated editor JSON.
        Per ADR 0006 the API never accepts client-supplied HTML as canonical
        content, so this is server-generated trusted output — the site never
        renders markup that came from a browser.
      */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: article.contentHtml }} />

      {article.authorPlacement === 'end' ? (
        <footer style={{ marginBlockStart: 'var(--space-xl)' }}>
          <Byline article={article} />
        </footer>
      ) : null}
    </article>
  );
}
