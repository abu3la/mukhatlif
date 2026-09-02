import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaginatedList, PublicGuest } from '@mukhtalif/types';
import { GuestCard } from '@/components/guest-card';
import {
  GUEST_SEARCH_MAX_LENGTH,
  guestCountLabel,
  parseGuestSearch,
} from '@/components/guest-utils';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listGuests } from '@/lib/api';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'مكتبة الضيوف',
  description: 'تعرّف إلى ضيوف شبكة مختلف وحلقاتهم المنشورة على يوتيوب.',
  alternates: { canonical: '/guests' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GuestsPage({ searchParams }: { searchParams: SearchParams }) {
  const requested = await searchParams;
  const page = parsePage(requested.page);
  const search = parseGuestSearch(requested.search);

  let guests: PaginatedList<PublicGuest>;
  try {
    guests = await listGuests({ page, perPage: 12, search: search || undefined });
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
    return (
      <div className="content-page guest-library">
        <div className="content-container">
          <ErrorState
            title="تعذّر تحميل مكتبة الضيوف"
            text="لم نتمكن من الوصول إلى بيانات الضيوف الآن. جرّب التحديث بعد قليل."
          />
        </div>
      </div>
    );
  }

  const emptyTitle = search
    ? `لا نتائج لـ«${search}»`
    : page > 1
      ? 'لا مزيد من الضيوف'
      : 'لا ضيوف منشورون بعد';
  const emptyText = search
    ? 'جرّب اسمًا أو مجالًا أو مدينة أخرى.'
    : page > 1
      ? 'وصلت إلى نهاية المكتبة.'
      : 'ستظهر ملفات الضيوف هنا بعد نشرها.';

  return (
    <div className="content-page guest-library">
      <div className="content-container">
        <section className="guest-library__hero" aria-labelledby="guest-library-title">
          <div className="guest-library__intro">
            <h1 className="guest-library__title" id="guest-library-title">
              ضيوفنا
            </h1>
            <p className="guest-library__lede">ننتقي ضيوفنا لنثري الحوار</p>
          </div>
          <p className="guest-library__count" aria-label={guestCountLabel(guests.pageInfo.total)}>
            <strong>{guestCountLabel(guests.pageInfo.total)}</strong>
            <span>في مكتبة مختلف</span>
          </p>
        </section>

        <form className="guest-search" action="/guests" role="search">
          <label className="guest-search__label" htmlFor="guest-search-input">
            ابحث عن ضيف
          </label>
          <div className="guest-search__controls">
            <input
              key={search}
              className="guest-search__input"
              id="guest-search-input"
              type="search"
              name="search"
              defaultValue={search}
              maxLength={GUEST_SEARCH_MAX_LENGTH}
              placeholder="الاسم، المجال أو المدينة"
              autoComplete="off"
            />
            <button className="guest-search__submit" type="submit">
              بحث
            </button>
            {search ? (
              <Link className="guest-search__clear" href="/guests">
                مسح البحث
              </Link>
            ) : null}
          </div>
        </form>

        <section className="content-section guest-results" aria-labelledby="guest-results-title">
          <div className="content-section__header">
            <h2 className="content-section__title" id="guest-results-title">
              {search ? 'نتائج البحث' : 'مكتبة الضيوف'}
            </h2>
            {search && guests.items.length > 0 ? (
              <p className="content-section__meta">
                {`عدد النتائج: ${guests.pageInfo.total.toLocaleString('ar-u-nu-arab', {
                  useGrouping: false,
                })}`}
              </p>
            ) : null}
          </div>

          {guests.items.length === 0 ? (
            <>
              <EmptyState title={emptyTitle} text={emptyText} />
              {page > 1 && !search ? (
                <p className="guest-results__return">
                  <Link className="action" href="/guests">
                    العودة إلى البداية
                  </Link>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="guest-grid">
                {guests.items.map((guest) => (
                  <GuestCard key={guest.id} guest={guest} />
                ))}
              </div>
              <Pager
                pageInfo={guests.pageInfo}
                basePath="/guests"
                query={{ search: search || undefined }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
