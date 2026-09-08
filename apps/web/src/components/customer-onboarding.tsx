'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Show } from '@mukhtalif/types';
import { customerError, safeCustomerReturn } from '@/lib/customer-utils';
import { useCustomer } from './customer-provider';
import { CustomerAuthFrame, CustomerGate } from './customer-ui';
import { CustomerInterestsForm } from './customer-library';

export function CustomerOnboarding({ step, next }: { step: number; next?: string }) {
  return (
    <CustomerGate>
      <OnboardingContent step={step} next={safeCustomerReturn(next, '/')} />
    </CustomerGate>
  );
}

function OnboardingContent({ step, next }: { step: number; next: string }) {
  const customer = useCustomer();
  const router = useRouter();
  const [shows, setShows] = useState<Show[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingShows, setLoadingShows] = useState(true);
  useEffect(() => {
    let active = true;
    void customer
      .publicRead<Show[]>('/shows')
      .then((data) => {
        if (active) setShows(data);
      })
      .catch((failure) => {
        if (active) setError(customerError(failure));
      })
      .finally(() => {
        if (active) setLoadingShows(false);
      });
    return () => {
      active = false;
    };
  }, [customer.publicRead]);
  async function finish(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const selected = event ? new FormData(event.currentTarget).getAll('shows').map(String) : [];
    setBusy(true);
    setError('');
    try {
      if (event) {
        for (const show of shows) {
          const wasFollowed = customer.library.followedShowIds.includes(show.id);
          const wanted = selected.includes(show.id);
          if (wasFollowed !== wanted)
            await customer.mutateLibrary(
              `/follows/${encodeURIComponent(show.id)}`,
              wanted ? 'PUT' : 'DELETE',
            );
        }
      }
      await customer.updateProfile({ onboarded: true });
      router.replace(next);
    } catch (failure) {
      setError(customerError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <CustomerAuthFrame title="اسمع ما يهمك." intro="اختر بداية قريبة منك. يمكنك تغييرها في أي وقت.">
      <div className="customer-interest-form">
        <p className="customer-step-label">الخطوة {step === 2 ? '2' : '1'} من 2</p>
        <h2 className="customer-onboarding-title">
          {step === 2 ? 'اختر أصواتًا تود متابعتها.' : 'ما الموضوعات التي تشغلك؟'}
        </h2>
        {step !== 2 ? (
          <CustomerInterestsForm
            onComplete={async () => {
              router.push(`/onboarding?step=2&next=${encodeURIComponent(next)}`);
            }}
          />
        ) : (
          <form className="customer-interest-form" onSubmit={finish} aria-busy={busy}>
            {loadingShows ? (
              <p role="status">جارٍ تحميل البرامج…</p>
            ) : (
              <div className="customer-show-choices">
                {shows.map((show) => (
                  <label className="customer-show-choice" key={show.id}>
                    <input
                      type="checkbox"
                      name="shows"
                      value={show.id}
                      defaultChecked={customer.library.followedShowIds.includes(show.id)}
                    />
                    {show.artworkUrl && <img src={show.artworkUrl} alt="" width="48" height="48" />}
                    <span>{show.titleAr}</span>
                  </label>
                ))}
              </div>
            )}
            <button className="customer-primary" disabled={busy || loadingShows}>
              {busy ? 'جارٍ الحفظ…' : 'ابدأ الاستماع'}
            </button>
            <button
              type="button"
              className="customer-text-button"
              disabled={busy}
              onClick={() => router.push(`/onboarding?next=${encodeURIComponent(next)}`)}
            >
              عدّل الموضوعات
            </button>
          </form>
        )}
        {error && (
          <p className="customer-error" role="alert">
            {error}
          </p>
        )}
        <button className="customer-text-button" disabled={busy} onClick={() => void finish()}>
          تخطّ الآن
        </button>
      </div>
    </CustomerAuthFrame>
  );
}
