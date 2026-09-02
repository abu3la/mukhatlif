import { useState } from 'react';
import { Input } from '@/shared/ui/primitives';
import { formatArabicInteger, type Guest, type GuestSocial, type GuestSocialId } from '@/lib';
import { GuestSocialsSection } from './guest-socials-section';
import type { GuestProfilePatch } from './guest-identity-section';

interface GuestContactCardProps {
  guest: Guest;
  socials: GuestSocial[];
  appearanceCount: number;
  readOnly?: boolean;
  onGuestUpdate: (patch: GuestProfilePatch) => Promise<void>;
  onSocialAdd: () => Promise<void>;
  onSocialUpdate: (
    id: GuestSocialId,
    patch: Partial<Pick<GuestSocial, 'platform' | 'handle'>>,
  ) => Promise<void>;
  onSocialRemove: (id: GuestSocialId) => Promise<void>;
}

export function GuestContactCard({
  guest,
  socials,
  appearanceCount,
  readOnly = false,
  onGuestUpdate,
  onSocialAdd,
  onSocialUpdate,
  onSocialRemove,
}: GuestContactCardProps) {
  const [draft, setDraft] = useState(() => ({ email: guest.email, city: guest.city }));
  const [pendingField, setPendingField] = useState<'email' | 'city' | null>(null);
  const [operationError, setOperationError] = useState('');

  async function commit(field: 'email' | 'city') {
    if (pendingField || draft[field] === guest[field]) return;
    setPendingField(field);
    setOperationError('');
    try {
      await onGuestUpdate({ [field]: draft[field] });
    } catch {
      setOperationError('تعذّر حفظ بيانات التواصل. بقيت التعديلات في الحقول، حاول مرة أخرى.');
    } finally {
      setPendingField(null);
    }
  }

  return (
    <aside className="card contact-card" aria-label="الحسابات والتواصل">
      <h2>الحسابات والتواصل</h2>
      <GuestSocialsSection
        socials={socials}
        readOnly={readOnly}
        onAdd={onSocialAdd}
        onUpdate={onSocialUpdate}
        onRemove={onSocialRemove}
      />

      <div className="contact-fields">
        {readOnly ? (
          <>
            <div className="field">
              <span className="field__label">البريد الإلكتروني</span>
              <p className="user-email">{guest.email || 'غير مسجل'}</p>
            </div>
            <div className="field">
              <span className="field__label">المدينة</span>
              <p className="table-secondary">{guest.city || 'غير محددة'}</p>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span className="field__label">البريد الإلكتروني</span>
              <Input
                type="email"
                dir="ltr"
                value={draft.email}
                disabled={pendingField !== null}
                aria-busy={pendingField === 'email'}
                onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))}
                onBlur={() => void commit('email')}
              />
            </label>
            <label className="field">
              <span className="field__label">المدينة</span>
              <Input
                value={draft.city}
                disabled={pendingField !== null}
                aria-busy={pendingField === 'city'}
                onChange={(event) => setDraft((value) => ({ ...value, city: event.target.value }))}
                onBlur={() => void commit('city')}
              />
            </label>
          </>
        )}
      </div>

      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}

      <div className="contact-summary-row">
        <span>عدد الظهور</span>
        <strong>{formatArabicInteger(appearanceCount)}</strong>
      </div>
    </aside>
  );
}
