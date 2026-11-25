import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaginatedList, PublicGuest } from '@mukhtalif/types';
import { GuestSearchField } from '@/components/guest-search-field';
import { guestAppearanceLabel, guestCountLabel, parseGuestSearch } from '@/components/guest-utils';
import { formatNumber } from '@/components/formatting';
import { Pager, parsePage } from '@/components/pager';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, listGuests } from '@/lib/api';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'الضيوف',
  description: 'تعرّف إلى ضيوف شبكة مختلف وحلقاتهم المنشورة على يوتيوب.',
  alternates: { canonical: '/guests' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The guests on the presentation site (D-24). The question stands on the
 * night stage with how many guests the library holds; the guests follow on the
 * sheet by name and what they do, never as initials, a page at a time. A new
 * page opens at the list.
 */
export default async function GuestsPage({ searchParams }: { searchParams: SearchParams }) {
  const requested = await searchParams;
  const page = parsePage(requested.page);
  const search = parseGuestSearch(requested.search);

  let guests: PaginatedList<PublicGuest> | null = null;
  try {
    guests = await listGuests({ page, perPage: 12, search: search || undefined });
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }

  const total = guests?.pageInfo.total ?? 0;
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
    <div className="stage-page guests-page">
      <div className="stage-scope">
        <section className="stage-intro search-stage" aria-labelledby="guests-title">
          <div className="content-container stage-head">
            <h1 id="guests-title" className="stage-statement">
              الضيوف
            </h1>
            <p className="stage-head__lede">
              ضيوف يفتحون لنا بابًا على تجاربهم.
              {!search && total ? (
                <>
                  {' '}
                  <span className="stage-head__fact">{guestCountLabel(total)} في مكتبة مختلف.</span>
                </>
              ) : null}
            </p>
            <GuestSearchField search={search} />
            {search ? (
              <p className="search-count guests-count">
                {guests && total ? <span>{`عدد النتائج: ${formatNumber(total)}`}</span> : null}
                <Link className="stage-link" href="/guests">
                  مسح البحث
                </Link>
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section
            className="content-container guests-list"
            id="guests-list"
            aria-labelledby="guest-results-title"
          >
            <h2 className="cover-section__title" id="guest-results-title">
              {search ? 'نتائج البحث' : 'مكتبة الضيوف'}
            </h2>
            {guests === null ? (
              <ErrorState
                title="تعذّر تحميل مكتبة الضيوف"
                text="لم نتمكن من الوصول إلى بيانات الضيوف الآن. جرّب التحديث بعد قليل."
              />
            ) : guests.items.length === 0 ? (
              <>
                <EmptyState title={emptyTitle} text={emptyText} />
                {page > 1 && !search ? (
                  <p className="guests-return">
                    <Link className="stage-link" href="/guests">
                      العودة إلى البداية
                    </Link>
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <ul className="search-guests">
                  {guests.items.map((guest) => {
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
                          <span className="search-guest__count">
                            {guestAppearanceLabel(guest.episodeCount)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <Pager
                  pageInfo={guests.pageInfo}
                  basePath="/guests"
                  query={{ search: search || undefined }}
                  hash="#guests-list"
                  labels={{ previous: 'السابق', next: 'التالي' }}
                />
              </>
            )}
          </section>

          <div className="content-container">
            <section className="community-invite cover-invite" aria-labelledby="invite-title">
              <div>
                <h2 className="community-invite__title" id="invite-title">
                  مين ودّك نسمع قصته؟
                </h2>
                <p>رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار.</p>
              </div>
              <Link className="public-primary" href="/suggest">
                اقترح ضيفًا
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
