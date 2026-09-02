import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FORM_SUBMISSION_STATUSES, type FormSubmission } from '@mukhtalif/types';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  adminPaths,
  canManagePage,
  useAdminAuth,
  useFormSubmissionRepository,
} from '@/application';
import { isAdminRepositoryError } from '@/data';
import { formatArabicDateTime, formatArabicInteger } from '@/lib';
import {
  Button,
  Field,
  PageBreadcrumb,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui/primitives';
import {
  FORM_NOTIFICATION_STATUS_LABELS,
  FORM_SUBMISSION_STATUS_LABELS,
  FORM_SUBMISSION_TYPE_LABELS,
  formSubmissionDisplayFields,
  formSubmissionSummary,
  notificationErrorLabel,
} from '../model/form-submission-copy';

function operationErrorMessage(error: unknown, action: 'save' | 'retry'): string {
  if (isAdminRepositoryError(error)) {
    if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED') {
      return 'لا تملك صلاحية إدارة هذا الطلب.';
    }
    if (error.code === 'NOT_FOUND') return 'الطلب غير موجود. ارجع إلى قائمة الطلبات.';
    if (error.code === 'CONFLICT' && action === 'retry') {
      return 'حالة البريد تغيّرت. حدّث الصفحة قبل المحاولة.';
    }
    if (error.code === 'VALIDATION') return 'راجع البيانات ثم حاول مرة أخرى.';
  }
  return action === 'save'
    ? 'تعذّر حفظ التغييرات. حاول مرة أخرى.'
    : 'تعذّر إعادة إرسال البريد. حاول مرة أخرى.';
}

function DetailContent({
  submission,
  onUpdated,
}: {
  submission: FormSubmission;
  onUpdated(updated: FormSubmission): void;
}) {
  const repository = useFormSubmissionRepository();
  const { viewer } = useAdminAuth();
  const canManage = Boolean(viewer && canManagePage(viewer, 'forms'));
  const [status, setStatus] = useState(submission.status);
  const [assigneeId, setAssigneeId] = useState(submission.assigneeId ?? '');
  const [internalNotes, setInternalNotes] = useState(submission.internalNotes);
  const [pendingAction, setPendingAction] = useState<'save' | 'retry' | null>(null);
  const [feedback, setFeedback] = useState<
    { readonly kind: 'success' | 'error'; readonly message: string } | null
  >(null);

  useEffect(() => {
    setStatus(submission.status);
    setAssigneeId(submission.assigneeId ?? '');
    setInternalNotes(submission.internalNotes);
  }, [submission]);

  const currentViewerId = viewer?.id ?? '';
  const assignedToAnother = Boolean(
    submission.assigneeId && submission.assigneeId !== currentViewerId,
  );
  const hasChanges =
    status !== submission.status ||
    assigneeId !== (submission.assigneeId ?? '') ||
    internalNotes !== submission.internalNotes;
  const notificationCanRetry =
    submission.notificationStatus !== 'sent' &&
    submission.notificationStatus !== 'sending';
  const fields = formSubmissionDisplayFields(submission);

  async function saveChanges() {
    if (!canManage || !hasChanges || pendingAction) return;
    setPendingAction('save');
    setFeedback(null);
    try {
      const updated = await repository.updateFormSubmission(submission.id, {
        status,
        assigneeId: assigneeId || null,
        internalNotes,
      });
      onUpdated(updated);
      setFeedback({ kind: 'success', message: 'حُفظت التغييرات.' });
    } catch (error) {
      setFeedback({ kind: 'error', message: operationErrorMessage(error, 'save') });
    } finally {
      setPendingAction(null);
    }
  }

  async function retryNotification() {
    if (!canManage || !notificationCanRetry || pendingAction) return;
    setPendingAction('retry');
    setFeedback(null);
    try {
      const updated = await repository.retryFormSubmissionNotification(submission.id);
      onUpdated(updated);
      if (updated.notificationStatus === 'sent') {
        setFeedback({ kind: 'success', message: 'أُرسل البريد.' });
      } else if (updated.notificationStatus === 'unconfigured') {
        setFeedback({
          kind: 'error',
          message: 'لم يُرسل البريد لأن إعداداته غير مكتملة.',
        });
      } else if (updated.notificationStatus === 'failed') {
        setFeedback({
          kind: 'error',
          message: 'تعذّر إرسال البريد. راجع سبب التعذّر ثم حاول مرة أخرى.',
        });
      } else {
        setFeedback({ kind: 'success', message: 'بدأت محاولة إرسال البريد.' });
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: operationErrorMessage(error, 'retry') });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="submission-details-grid">
      <div className="submission-details-main">
        <section className="card submission-section" aria-labelledby="submission-content-title">
          <header className="submission-section__header">
            <div>
              <h2 id="submission-content-title">بيانات الطلب</h2>
              <p>{FORM_SUBMISSION_TYPE_LABELS[submission.type]}</p>
            </div>
            <span className={`request-status request-status--${submission.status}`}>
              {FORM_SUBMISSION_STATUS_LABELS[submission.status]}
            </span>
          </header>
          <dl className="submission-fields">
            {fields.map((field) => (
              <div className="submission-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd dir={field.direction ?? 'auto'}>
                  {field.href ? (
                    <a href={field.href} target="_blank" rel="noreferrer" className="text-link">
                      {field.value}
                    </a>
                  ) : (
                    field.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card submission-section" aria-labelledby="submission-source-title">
          <header className="submission-section__header">
            <div>
              <h2 id="submission-source-title">بيانات الوصول</h2>
              <p>معلومات أنشأها النظام عند استلام الطلب.</p>
            </div>
          </header>
          <dl className="submission-fields submission-fields--compact">
            <div className="submission-field">
              <dt>وصل في</dt>
              <dd>{formatArabicDateTime(submission.createdAt)}</dd>
            </div>
            <div className="submission-field">
              <dt>الموافقة على الخصوصية</dt>
              <dd>{formatArabicDateTime(submission.sourceMetadata.privacyAcceptedAt)}</dd>
            </div>
            {submission.sourceMetadata.referrerPath ? (
              <div className="submission-field">
                <dt>صفحة الإرسال</dt>
                <dd dir="ltr">{submission.sourceMetadata.referrerPath}</dd>
              </div>
            ) : null}
            {submission.sourceMetadata.countryCode ? (
              <div className="submission-field">
                <dt>رمز الدولة</dt>
                <dd dir="ltr">{submission.sourceMetadata.countryCode}</dd>
              </div>
            ) : null}
            <div className="submission-field">
              <dt>معرّف الطلب</dt>
              <dd dir="ltr">{submission.sourceMetadata.requestId}</dd>
            </div>
          </dl>
        </section>

        {submission.attachmentRefs.length > 0 ? (
          <section className="card submission-section" aria-labelledby="submission-files-title">
            <header className="submission-section__header">
              <div>
                <h2 id="submission-files-title">المرفقات</h2>
                <p>عدد الملفات: {formatArabicInteger(submission.attachmentRefs.length)}</p>
              </div>
            </header>
            <ul className="submission-attachments">
              {submission.attachmentRefs.map((attachment) => (
                <li key={attachment.id}>
                  <bdi dir="auto">{attachment.fileName}</bdi>
                  <span>{attachment.mimeType}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="submission-details-side" aria-label="إدارة الطلب">
        <section className="card submission-management">
          <h2>إدارة الطلب</h2>
          {canManage ? (
            <>
              <Field label="الحالة">
                <Select
                  aria-label="حالة الطلب"
                  value={status}
                  disabled={pendingAction !== null}
                  onChange={(event) => {
                    setStatus(event.currentTarget.value as FormSubmission['status']);
                    setFeedback(null);
                  }}
                >
                  {FORM_SUBMISSION_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {FORM_SUBMISSION_STATUS_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="المسؤول"
                hint={
                  assignedToAnother
                    ? 'يمكنك إبقاء المسؤول الحالي، أو إسناد الطلب إليك، أو إلغاء الإسناد.'
                    : undefined
                }
              >
                <Select
                  aria-label="مسؤول الطلب"
                  value={assigneeId}
                  disabled={pendingAction !== null}
                  onChange={(event) => {
                    setAssigneeId(event.currentTarget.value);
                    setFeedback(null);
                  }}
                >
                  <option value="">بلا مسؤول</option>
                  {currentViewerId ? <option value={currentViewerId}>إسناد إليّ</option> : null}
                  {assignedToAnother && submission.assigneeId ? (
                    <option value={submission.assigneeId}>المسؤول الحالي</option>
                  ) : null}
                </Select>
              </Field>

              <Field label="ملاحظات داخلية" hint="لا تظهر لصاحب الطلب.">
                <Textarea
                  aria-label="ملاحظات داخلية"
                  value={internalNotes}
                  maxLength={10_000}
                  disabled={pendingAction !== null}
                  onChange={(event) => {
                    setInternalNotes(event.currentTarget.value);
                    setFeedback(null);
                  }}
                />
              </Field>

              <Button
                type="button"
                variant="primary"
                disabled={!hasChanges || pendingAction !== null}
                aria-busy={pendingAction === 'save'}
                onClick={() => void saveChanges()}
              >
                {pendingAction === 'save' ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
              </Button>
            </>
          ) : (
            <dl className="submission-readonly-management">
              <div>
                <dt>المسؤول</dt>
                <dd>{submission.assigneeId ? 'مسند' : 'بلا مسؤول'}</dd>
              </div>
              <div>
                <dt>الملاحظات الداخلية</dt>
                <dd>{submission.internalNotes || 'لا ملاحظات.'}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="card submission-notification" aria-labelledby="notification-title">
          <h2 id="notification-title">تنبيه البريد</h2>
          <p className={`notification-state notification-state--${submission.notificationStatus}`}>
            {FORM_NOTIFICATION_STATUS_LABELS[submission.notificationStatus]}
          </p>
          <dl>
            <div>
              <dt>عدد المحاولات</dt>
              <dd>{formatArabicInteger(submission.notificationAttemptCount)}</dd>
            </div>
            {submission.notificationAttemptedAt ? (
              <div>
                <dt>آخر محاولة</dt>
                <dd>{formatArabicDateTime(submission.notificationAttemptedAt)}</dd>
              </div>
            ) : null}
          </dl>
          {submission.notificationError ? (
            <div className="notification-error">
              <p>{notificationErrorLabel(submission.notificationError)}</p>
              <bdi dir="ltr">{submission.notificationError}</bdi>
            </div>
          ) : null}
          {canManage && notificationCanRetry ? (
            <Button
              type="button"
              disabled={pendingAction !== null}
              aria-busy={pendingAction === 'retry'}
              onClick={() => void retryNotification()}
            >
              {pendingAction === 'retry' ? 'جارٍ الإرسال…' : 'إعادة إرسال البريد'}
            </Button>
          ) : null}
        </section>

        {feedback ? (
          <p
            className={`notice ${feedback.kind === 'error' ? 'notice--error' : ''}`}
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

export function FormSubmissionDetailsView() {
  const repository = useFormSubmissionRepository();
  const { viewer } = useAdminAuth();
  const queryClient = useQueryClient();
  const { submissionId = '' } = useParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queryKey = ['admin-studio', repository.kind, viewer?.id, 'form-submission', submissionId];
  const submissionQuery = useQuery({
    queryKey,
    queryFn: () => repository.getFormSubmission(submissionId),
    enabled: Boolean(submissionId),
  });

  useEffect(() => {
    if (submissionQuery.data) headingRef.current?.focus();
  }, [submissionQuery.data?.id]);

  function handleUpdated(updated: FormSubmission) {
    queryClient.setQueryData(queryKey, updated);
    void queryClient.invalidateQueries({
      queryKey: ['admin-studio', repository.kind, viewer?.id, 'form-submissions'],
    });
  }

  if (submissionQuery.isPending) {
    return (
      <section className="card embedded-state" aria-busy="true" aria-live="polite">
        <p>جارٍ تحميل الطلب…</p>
      </section>
    );
  }

  if (submissionQuery.error || !submissionQuery.data) {
    return (
      <section className="card embedded-state" role="alert">
        <h1>تعذّر تحميل الطلب</h1>
        <p>
          {isAdminRepositoryError(submissionQuery.error) &&
          submissionQuery.error.code === 'NOT_FOUND'
            ? 'الطلب غير موجود. ارجع إلى قائمة الطلبات.'
            : 'تحقق من الاتصال ثم حاول مرة أخرى.'}
        </p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => void submissionQuery.refetch()}
        >
          إعادة المحاولة
        </button>
      </section>
    );
  }

  const submission = submissionQuery.data;
  return (
    <div className="form-submission-details-page">
      <PageBreadcrumb
        parentLabel="طلبات الموقع"
        parentTo={adminPaths.formSubmissions}
        current={FORM_SUBMISSION_TYPE_LABELS[submission.type]}
      />
      <PageHeader
        title={formSubmissionSummary(submission)}
        detail={formatArabicDateTime(submission.createdAt)}
        headingRef={headingRef}
        headingTabIndex={-1}
      />
      <DetailContent submission={submission} onUpdated={handleUpdated} />
    </div>
  );
}
