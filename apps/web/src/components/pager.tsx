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
export function pageHref(
  basePath: string,
  page: number,
  query: Readonly<Record<string, string | undefined>> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const serialized = params.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

export function Pager({
  pageInfo,
  basePath,
  query,
}: {
  pageInfo: PageInfo;
  basePath: string;
  query?: Readonly<Record<string, string | undefined>>;
}) {
  if (pageInfo.totalPages <= 1) return null;
  const href = (page: number) => pageHref(basePath, page, query);

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
