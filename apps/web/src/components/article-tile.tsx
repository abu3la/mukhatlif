import Link from 'next/link';
import type { PublishedArticle } from '@mukhtalif/types';
import { dateTimeAttribute, formatDate } from './formatting';

export type TileArticle = Pick<
  PublishedArticle,
  'slug' | 'titleAr' | 'coverUrl' | 'publishedAt'
> & {
  author: { displayName: string };
};

/**
 * An article as the reading pages of the presentation site show it (D-24):
 * its cover, its title held to two lines, then who wrote it and when. A
 * missing cover keeps its slot so every row of a grid stays on one line.
 */
export function ArticleTile({ article }: { article: TileArticle }) {
  return (
    <li className="article-tile">
      <Link className="article-tile__link" href={`/articles/${encodeURIComponent(article.slug)}`}>
        {article.coverUrl ? (
          /* A native img, as on every article card: cover hosts are not known ahead of time. */
          <img
            className="article-tile__cover"
            src={article.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="article-tile__cover" aria-hidden="true" />
        )}
        <h3 className="article-tile__title">{article.titleAr}</h3>
        <span className="article-tile__meta">
          <span>{article.author.displayName}</span>
          {article.publishedAt ? (
            <time dateTime={dateTimeAttribute(article.publishedAt)}>
              {formatDate(article.publishedAt)}
            </time>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function ArticleTiles({ articles }: { articles: readonly TileArticle[] }) {
  return (
    <ul className="article-tiles">
      {articles.map((article) => (
        <ArticleTile key={article.slug} article={article} />
      ))}
    </ul>
  );
}
