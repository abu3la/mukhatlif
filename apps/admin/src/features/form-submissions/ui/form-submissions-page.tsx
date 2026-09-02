import { useQuery } from '@tanstack/react-query';
import {
  FORM_SUBMISSION_STATUSES,
  FORM_SUBMISSION_TYPES,
  type FormSubmissionStatus,
  type FormSubmissionType,
} from '@mukhtalif/types';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  adminPaths,
  useAdminAuth,
  useFormSubmissionRepository,
} from '@/application';
import { formatArabicDateTime, formatArabicInteger } from '@/lib';
import { PageHeader, Select } from '@/shared/ui/primitives';
import {
  FORM_NOTIFICATION_STATUS_LABELS,
  FORM_SUBMISSION_STATUS_LABELS,
  FORM_SUBMISSION_TYPE_LABELS,
  formatFormSubmissionCount,
  formSubmissionSummary,
} from '../model/form-submission-copy';

const PAGE_SIZE = 20;

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

export function FormSubmissionsView() {
  const repository = useFormSubmissionRepository();
  const { viewer } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageNumber(searchParams.get('page'));
  const type = supportedValue<FormSubmissionType>(
    searchParams.get('type'),
    FORM_SUBMISSION_TYPES,
  );
  const status = supportedValue<FormSubmissionStatus>(
    searchParams.get('status'),
    FORM_SUBMISSION_STATUSES,
  );
  const assignedToMe = searchParams.get('assignee') === 'me';

  const query = {
    page,
    perPage: PAGE_SIZE,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(assignedToMe && viewer ? { assigneeId: viewer.id } : {}),
  };
  const submissionsQuery = useQuery({
    queryKey: ['admin-studio', repository.kind, viewer?.id, 'form-submissions', query],
    queryFn: () => repository.listFormSubmissions(query),
  });

  useEffect(() => {
    const pageInfo = submissionsQuery.data?.pageInfo;
    if (!pageInfo) return;
    const lastPage = Math.max(1, pageInfo.totalPages);
    if (page <= lastPage) return;
    const next = new URLSearchParams(searchParams);
    if (lastPage === 1) next.delete('page');
    else next.set('page', String(lastPage));
    setSearchParams(next, { replace: true });
  }, [
    page,
    searchParams,
    setSearchParams,
    submissionsQuery.data?.pageInfo,
  ]);

  function setFilter(key: 'type' | 'status' | 'assignee', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next);
  }

  const data = submissionsQuery.data;

  return (
    <div className="form-submissions-page">
      <PageHeader
        title="طلبات الموقع"
        detail={data ? formatFormSubmissionCount(data.pageInfo.total) : 'صندوق موحّد'}
      />

      <section className="card submission-filters" aria-label="تصفية الطلبات">
        <label className="field">
          <span className="field__label">نوع الطلب</span>
          <Select
            aria-label="نوع الطلب"
            value={type ?? ''}
            onChange={(event) => setFilter('type', event.currentTarget.value)}
          >
            <option value="">كل الأنواع</option>
            {FORM_SUBMISSION_TYPES.map((item) => (
              <option key={item} value={item}>
                {FORM_SUBMISSION_TYPE_LABELS[item]}
              </option>
            ))}
          </Select>
        </label>

        <label className="field">
          <span className="field__label">الحالة</span>
          <Select
            aria-label="حالة الطلب"
            value={status ?? ''}
            onChange={(event) => setFilter('status', event.currentTarget.value)}
          >
            <option value="">كل الحالات</option>
            {FORM_SUBMISSION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {FORM_SUBMISSION_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </label>

        <label className="field">
          <span className="field__label">المسؤول</span>
          <Select
            aria-label="مسؤول الطلب"
            value={assignedToMe ? 'me' : ''}
            onChange={(event) => setFilter('assignee', event.currentTarget.value)}
          >
            <option value="">كل المسؤولين</option>
            <option value="me">المسندة إليّ</option>
          </Select>
        </label>
      </section>

      {submissionsQuery.isPending ? (
        <section className="card embedded-state" aria-busy="true" aria-live="polite">
          <p>جارٍ تحميل الطلبات…</p>
        </section>
      ) : submissionsQuery.error ? (
        <section className="card embedded-state" role="alert">
          <h2>تعذّر تحميل الطلبات</h2>
          <p>تحقق من الاتصال ثم حاول مرة أخرى.</p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void submissionsQuery.refetch()}
          >
            إعادة المحاولة
          </button>
        </section>
      ) : data && data.items.length === 0 ? (
        <section className="card" role="status">
          <p className="empty-state">
            {type || status || assignedToMe
              ? 'لا طلبات تطابق عوامل التصفية.'
              : 'لا طلبات بعد. ستظهر الطلبات الجديدة هنا.'}
          </p>
        </section>
      ) : data ? (
        <>
          <section className="card submission-table-card" aria-label="قائمة الطلبات">
            <div className="submission-table" role="table" aria-rowcount={data.pageInfo.total}>
              <div className="submission-table__row submission-table__row--header" role="row">
                <span role="columnheader">الطلب</span>
                <span role="columnheader">النوع</span>
                <span role="columnheader">الحالة</span>
                <span role="columnheader">البريد</span>
                <span role="columnheader">الوصول</span>
                <span aria-hidden="true" />
              </div>
              {data.items.map((submission) => (
                <article className="submission-table__row" role="row" key={submission.id}>
                  <div className="row-copy" role="cell">
                    <p className="table-primary">{formSubmissionSummary(submission)}</p>
                    <p className="row-copy__meta" dir="ltr">
                      {submission.id}
                    </p>
                  </div>
                  <span role="cell">{FORM_SUBMISSION_TYPE_LABELS[submission.type]}</span>
                  <span role="cell">
                    <span className={`request-status request-status--${submission.status}`}>
                      {FORM_SUBMISSION_STATUS_LABELS[submission.status]}
                    </span>
                  </span>
                  <span className="table-secondary" role="cell">
                    {FORM_NOTIFICATION_STATUS_LABELS[submission.notificationStatus]}
                  </span>
                  <time className="table-secondary" role="cell" dateTime={submission.createdAt}>
                    {formatArabicDateTime(submission.createdAt)}
                  </time>
                  <span role="cell">
                    <Link
                      className="button button--quiet"
                      to={adminPaths.formSubmission(submission.id)}
                    >
                      عرض الطلب
                    </Link>
                  </span>
                </article>
              ))}
            </div>
          </section>

          <nav className="submission-pagination" aria-label="صفحات الطلبات">
            <button
              className="button button--quiet"
              type="button"
              disabled={!data.pageInfo.hasPreviousPage || submissionsQuery.isFetching}
              onClick={() => goToPage(page - 1)}
            >
              الصفحة السابقة
            </button>
            <p aria-live="polite">
              الصفحة {formatArabicInteger(data.pageInfo.page)} من{' '}
              {formatArabicInteger(Math.max(1, data.pageInfo.totalPages))}
            </p>
            <button
              className="button button--quiet"
              type="button"
              disabled={!data.pageInfo.hasNextPage || submissionsQuery.isFetching}
              onClick={() => goToPage(page + 1)}
            >
              الصفحة التالية
            </button>
          </nav>
        </>
      ) : null}
    </div>
  );
}
