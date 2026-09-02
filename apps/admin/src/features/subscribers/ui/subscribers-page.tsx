import { useState } from 'react';
import { Button, PageHeader, StatusBadge } from '@/shared/ui/primitives';
import { canManagePage, useAdminAuth, useSubscriberDirectory } from '@/application';
import {
  formatArabicDate,
  formatSarHalalas,
  formatSubscriptionDetail,
  formatArabicInteger,
  getSubscriptionTransitionActions,
  hasPlusAccount,
} from '@/lib';

export function SubscribersView() {
  const { viewer } = useAdminAuth();
  const { data, transitionSubscriptionStatus, activatePlus } = useSubscriberDirectory();
  const canManageSubscribers = viewer ? canManagePage(viewer, 'subscribers') : false;
  const appUsers = data.users;
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [operationError, setOperationError] = useState('');

  async function runAction(
    actionKey: string,
    failureMessage: string,
    operation: () => Promise<void>,
  ) {
    if (!canManageSubscribers || pendingAction) return;
    setPendingAction(actionKey);
    setOperationError('');
    try {
      await operation();
    } catch {
      setOperationError(failureMessage);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <PageHeader
        title="المشتركون"
        detail="حسابات التطبيق واشتراكات مختلف بلس. مشتركو البريد في صفحة «النشرة البريدية»."
      />

      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}

      <div className="stacked-sections">
        <section className="card table-card" aria-labelledby="plus-subscriptions-title">
          <div className="table-card__header">
            <h2 id="plus-subscriptions-title">اشتراكات مختلف بلس</h2>
            <p>الباقة الشهرية · {formatSarHalalas(data.plusPlan.priceHalalas)}</p>
          </div>
          <div
            className="subscription-list"
            role="region"
            aria-label="قائمة اشتراكات مختلف بلس"
            tabIndex={0}
          >
            {data.subscriptions.map((subscription) => {
              const user = data.users.find((item) => item.id === subscription.userId);
              const actions = getSubscriptionTransitionActions(subscription.status);
              return (
                <article className="subscription-row" key={subscription.id}>
                  <div className="row-copy">
                    <p className="table-primary">{user?.name ?? 'مستخدم غير معروف'}</p>
                    <p className="row-copy__meta">
                      بدأ في {formatArabicDate(subscription.startedAt)}
                    </p>
                  </div>
                  <p className="subscription-detail">{formatSubscriptionDetail(subscription)}</p>
                  {canManageSubscribers ? (
                    <div className="row-actions">
                      {actions.map((action) => (
                        <Button
                          key={action.to}
                          type="button"
                          disabled={pendingAction !== null}
                          aria-busy={
                            pendingAction === `subscription:${subscription.id}:${action.to}`
                          }
                          onClick={() =>
                            void runAction(
                              `subscription:${subscription.id}:${action.to}`,
                              'تعذّر تحديث الاشتراك. حاول مرة أخرى.',
                              () => transitionSubscriptionStatus(subscription.id, action.to),
                            )
                          }
                        >
                          {pendingAction === `subscription:${subscription.id}:${action.to}`
                            ? 'جارٍ التحديث…'
                            : action.label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <StatusBadge status={subscription.status} />
                </article>
              );
            })}
          </div>
        </section>

        <section className="card table-card" aria-labelledby="users-title">
          <div className="table-card__header">
            <h2 id="users-title">مستخدمو التطبيق</h2>
            <p>عدد مستخدمي التطبيق: {formatArabicInteger(appUsers.length)}</p>
          </div>
          <div className="user-list" role="region" aria-label="قائمة مستخدمي التطبيق" tabIndex={0}>
            <div className="user-table-header" aria-hidden="true">
              <span>المستخدم</span>
              <span>البريد الإلكتروني</span>
              <span>انضم في</span>
              <span>الحساب</span>
              <span />
            </div>
            {appUsers.map((user) => {
              const subscription = data.subscriptions.find((item) => item.userId === user.id);
              const plusAccount = hasPlusAccount(subscription);
              return (
                <article className="user-row" key={user.id}>
                  <p className="table-primary">{user.name}</p>
                  <p className="user-email">{user.email}</p>
                  <p className="table-secondary">{formatArabicDate(user.joinedAt)}</p>
                  <p className={`account-label ${plusAccount ? 'account-label--plus' : ''}`}>
                    {plusAccount ? 'مختلف بلس' : 'مجاني'}
                  </p>
                  <div>
                    {canManageSubscribers && !subscription ? (
                      <Button
                        type="button"
                        disabled={pendingAction !== null}
                        aria-busy={pendingAction === `activate:${user.id}`}
                        onClick={() =>
                          void runAction(
                            `activate:${user.id}`,
                            'تعذّر تفعيل مختلف بلس. حاول مرة أخرى.',
                            () => activatePlus(user.id),
                          )
                        }
                      >
                        {pendingAction === `activate:${user.id}`
                          ? 'جارٍ التفعيل…'
                          : 'تفعيل بلس يدويًا'}
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
