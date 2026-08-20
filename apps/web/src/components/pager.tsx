import Link from 'next/link';
import type { PageInfo } from '@mukhtalif/types';
import { formatNumber } from './formatting';

/**
 * Page navigation for a list route.
 *
 * The links are real hrefs rather than buttons so a page is shareable,
 * crawlable, and works before hydration. In RTL, "previous" sits on the right,
 * which the flex order handles without any manual side flipping.
 */
export function Pager({ pageInfo, basePath }: { pageInfo: PageInfo; basePath: string }) {
  if (pageInfo.totalPages <= 1) return null;
  const href = (page: number) => (page === 1 ? basePath : `${basePath}?page=${page}`);

  return (
    <nav className="pager" aria-label="تنقل بين الصفحات">
      {pageInfo.hasPreviousPage ? (
        <Link className="pager__link" href={href(pageInfo.page - 1)} rel="prev">
          الأحدث
        </Link>
      ) : null}
      <span className="pager__status" aria-current="page">
        {`صفحة ${formatNumber(pageInfo.page)} من ${formatNumber(pageInfo.totalPages)}`}
      </span>
      {pageInfo.hasNextPage ? (
        <Link className="pager__link" href={href(pageInfo.page + 1)} rel="next">
          الأقدم
        </Link>
      ) : null}
    </nav>
  );
}

/** Parses a `?page=` value, tolerating anything a reader might paste. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}
