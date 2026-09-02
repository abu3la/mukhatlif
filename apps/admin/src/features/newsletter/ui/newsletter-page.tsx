import { useQuery } from '@tanstack/react-query';
import {
  NEWSLETTER_CONSENT_EVENT_KINDS,
  NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES,
  type NewsletterConsentEventKind,
  type NewsletterSubscriptionSyncStatus,
} from '@mukhtalif/types';
import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminAuth, useNewsletterRepository } from '@/application';
import { formatArabicDateTime, formatArabicInteger } from '@/lib';
import { Button, Input, PageHeader, Select } from '@/shared/ui/primitives';
import {
  NEWSLETTER_LOCAL_STATUS_LABELS,
  NEWSLETTER_MAILCHIMP_STATUS_LABELS,
} from '../model/newsletter-copy';

const PAGE_SIZE = 25;

function supportedValue<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function pageNumber(value: string | null): number {
  const number = Number(value ?? '1');
  return Number.isInteger(number) && number >= 1 ? number : 1;
}

export function NewsletterView() {
  const repository = useNewsletterRepository();
  const { viewer } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageNumber(searchParams.get('page'));
  const localStatus = supportedValue<NewsletterConsentEventKind>(
    searchParams.get('localStatus'),
    NEWSLETTER_CONSENT_EVENT_KINDS,
  );
  const mailchimpStatus = supportedValue<NewsletterSubscriptionSyncStatus>(
    searchParams.get('mailchimpStatus'),
    NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES,
  );
  const [searchDraft, setSearchDraft] = useState('');
  const [activeSearch, setActiveSearch] = useState<string>();
  const query = {
    page,
    perPage: PAGE_SIZE,
    ...(activeSearch ? { search: activeSearch } : {}),
    ...(localStatus ? { localStatus } : {}),
    ...(mailchimpStatus ? { mailchimpStatus } : {}),
  };
  const subscribersQuery = useQuery({
    queryKey: ['admin-studio', repository.kind, viewer?.id, 'newsletter-subscribers', query],
    queryFn: () => repository.listNewsletterSubscribers(query),
  });

  useEffect(() => {
    if (!searchParams.has('search')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const pageInfo = subscribersQuery.data?.pageInfo;
    if (!pageInfo) return;
    const lastPage = Math.max(1, pageInfo.totalPages);
    if (page <= lastPage) return;
    const next = new URLSearchParams(searchParams);
    if (lastPage === 1) next.delete('page');
    else next.set('page', String(lastPage));
    setSearchParams(next, { replace: true });
  }, [page, searchParams, setSearchParams, subscribersQuery.data?.pageInfo]);

  function updateParams(changes: Record<string, string | undefined>, replace = true) {
    const next = new URLSearchParams(searchParams);
    next.delete('search');
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setSearchParams(next, { replace });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = searchDraft.trim();
    setActiveSearch(normalized || undefined);
    updateParams({});
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next);
  }

  const data = subscribersQuery.data;
  const hasFilters = Boolean(activeSearch || localStatus || mailchimpStatus);

  return (
    <div className="newsletter-page">
      <PageHeader
        title="النشرة البريدية"
        detail={
          data ? `إجمالي السجلات: ${formatArabicInteger(data.pageInfo.total)}` : 'دليل المشتركين'
        }
      />

      <p className="newsletter-provider-note">
        حالة الربط المعروضة هي آخر حالة مسجلة محليًا، وليست الحالة الحية داخل Mailchimp أثناء توقف
        الاشتراك.
      </p>

      <section className="card newsletter-filters" aria-label="البحث وتصفية المشتركين">
        <form className="newsletter-search" role="search" onSubmit={submitSearch}>
          <label className="field" htmlFor="newsletter-search-input">
            <span className="field__label">البحث</span>
            <Input
              id="newsletter-search-input"
              type="search"
              value={searchDraft}
              maxLength={200}
              placeholder="name@example.com"
              autoComplete="off"
              onChange={(event) => setSearchDraft(event.currentTarget.value)}
            />
          </label>
          <Button variant="primary" className="newsletter-search__submit" type="submit">
            بحث
          </Button>
        </form>

        <label className="field">
          <span className="field__label">حالة الاشتراك محليًا</span>
          <Select
            aria-label="حالة الاشتراك محليًا"
            value={localStatus ?? ''}
            onChange={(event) =>
              updateParams({ localStatus: event.currentTarget.value || undefined })
            }
          >
            <option value="">كل الحالات</option>
            {NEWSLETTER_CONSENT_EVENT_KINDS.map((status) => (
              <option key={status} value={status}>
                {NEWSLETTER_LOCAL_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>

        <label className="field">
          <span className="field__label">حالة الربط مع Mailchimp</span>
          <Select
            aria-label="حالة الربط مع Mailchimp"
            value={mailchimpStatus ?? ''}
            onChange={(event) =>
              updateParams({ mailchimpStatus: event.currentTarget.value || undefined })
            }
          >
            <option value="">كل الحالات</option>
            {NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES.map((status) => (
              <option key={status} value={status}>
                {NEWSLETTER_MAILCHIMP_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>
      </section>

      {subscribersQuery.isPending ? (
        <section className="card embedded-state" aria-busy="true" aria-live="polite">
          <p>جارٍ تحميل المشتركين…</p>
        </section>
      ) : subscribersQuery.error ? (
        <section className="card embedded-state" role="alert">
          <h2>تعذّر تحميل المشتركين</h2>
          <p>تحقق من الاتصال ثم حاول مرة أخرى.</p>
          <Button variant="primary" type="button" onClick={() => void subscribersQuery.refetch()}>
            إعادة المحاولة
          </Button>
        </section>
      ) : data && data.items.length === 0 ? (
        <section className="card" role="status">
          <p className="empty-state">
            {hasFilters
              ? 'لا مشتركين يطابقون البحث أو عوامل التصفية.'
              : 'لا مشتركين بعد. ستظهر طلبات الاشتراك هنا.'}
          </p>
        </section>
      ) : data ? (
        <>
          <section
            className="card newsletter-table-card"
            aria-label="مشتركو النشرة البريدية، جدول قابل للتمرير أفقيًا"
            tabIndex={0}
          >
            <div
              className="newsletter-table"
              role="table"
              aria-rowcount={data.pageInfo.total + 1}
              aria-busy={subscribersQuery.isFetching}
            >
              <div
                className="newsletter-table__row newsletter-table__row--header"
                role="row"
                aria-rowindex={1}
              >
                <span role="columnheader">البريد الإلكتروني</span>
                <span role="columnheader">الاسم الأول</span>
                <span role="columnheader">حالة الاشتراك محليًا</span>
                <span role="columnheader">حالة الربط مع Mailchimp</span>
                <span role="columnheader">آخر طلب</span>
                <span role="columnheader">آخر تحديث</span>
              </div>
              {data.items.map((subscriber, index) => (
                <div
                  className="newsletter-table__row"
                  role="row"
                  aria-rowindex={(data.pageInfo.page - 1) * data.pageInfo.perPage + index + 2}
                  key={subscriber.email}
                >
                  <bdi className="newsletter-email" dir="ltr" role="cell">
                    {subscriber.email}
                  </bdi>
                  <span role="cell">{subscriber.firstName ?? 'غير مضاف'}</span>
                  <span className="newsletter-state" role="cell">
                    {NEWSLETTER_LOCAL_STATUS_LABELS[subscriber.localStatus]}
                  </span>
                  <span className="newsletter-state" role="cell">
                    {NEWSLETTER_MAILCHIMP_STATUS_LABELS[subscriber.mailchimpSyncStatus]}
                  </span>
                  <time role="cell" dateTime={subscriber.requestedAt}>
                    {formatArabicDateTime(subscriber.requestedAt)}
                  </time>
                  <time role="cell" dateTime={subscriber.updatedAt}>
                    {formatArabicDateTime(subscriber.updatedAt)}
                  </time>
                </div>
              ))}
            </div>
          </section>

          <nav className="newsletter-pagination" aria-label="صفحات المشتركين">
            <Button
              type="button"
              disabled={!data.pageInfo.hasPreviousPage || subscribersQuery.isFetching}
              onClick={() => goToPage(page - 1)}
            >
              الصفحة السابقة
            </Button>
            <p aria-live="polite">
              الصفحة {formatArabicInteger(data.pageInfo.page)} من{' '}
              {formatArabicInteger(Math.max(1, data.pageInfo.totalPages))}
            </p>
            <Button
              type="button"
              disabled={!data.pageInfo.hasNextPage || subscribersQuery.isFetching}
              onClick={() => goToPage(page + 1)}
            >
              الصفحة التالية
            </Button>
          </nav>
        </>
      ) : null}
    </div>
  );
}
