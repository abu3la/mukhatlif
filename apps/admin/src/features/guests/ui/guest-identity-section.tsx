import { useState } from 'react';
import { Textarea } from '@/shared/ui/primitives';
import type { Guest } from '@/lib';

export type GuestProfilePatch = Partial<Pick<Guest, 'name' | 'role' | 'bio' | 'email' | 'city'>>;
type GuestIdentityField = 'name' | 'role' | 'bio';

interface GuestIdentitySectionProps {
  guest: Guest;
  readOnly?: boolean;
  onUpdate: (patch: GuestProfilePatch) => Promise<void>;
}

export function GuestIdentitySection({
  guest,
  readOnly = false,
  onUpdate,
}: GuestIdentitySectionProps) {
  const [draft, setDraft] = useState(() => ({
    name: guest.name,
    role: guest.role,
    bio: guest.bio,
  }));
  const [pendingField, setPendingField] = useState<GuestIdentityField | null>(null);
  const [operationError, setOperationError] = useState('');

  async function commit(field: GuestIdentityField) {
    if (pendingField || draft[field] === guest[field]) return;
    setPendingField(field);
    setOperationError('');
    try {
      await onUpdate({ [field]: draft[field] });
    } catch {
      setOperationError('تعذّر حفظ بيانات الضيف. بقيت التعديلات في الحقول، حاول مرة أخرى.');
    } finally {
      setPendingField(null);
    }
  }

  return (
    <>
      <div className="profile-section profile-identity">
        <div className="profile-photo" aria-label={`صورة ${guest.name || 'الضيف'}`} />
        <div>
          {readOnly ? (
            <>
              <p className="inline-field--name">{guest.name || 'ضيف بلا اسم'}</p>
              <p className="inline-field--role">{guest.role || 'المسمى غير محدد'}</p>
            </>
          ) : (
            <>
              <input
                className="inline-field inline-field--name"
                value={draft.name}
                disabled={pendingField !== null}
                aria-busy={pendingField === 'name'}
                onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
                onBlur={() => void commit('name')}
                placeholder="اسم الضيف"
                aria-label="اسم الضيف"
              />
              <input
                className="inline-field inline-field--role"
                value={draft.role}
                disabled={pendingField !== null}
                aria-busy={pendingField === 'role'}
                onChange={(event) => setDraft((value) => ({ ...value, role: event.target.value }))}
                onBlur={() => void commit('role')}
                placeholder="المسمى · الجهة"
                aria-label="المسمى والجهة"
              />
            </>
          )}
        </div>
      </div>

      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}

      <div className="profile-section">
        {readOnly ? (
          <div className="field">
            <span className="field__label">نبذة</span>
            <p className="guest-card__bio">{guest.bio || 'لا توجد نبذة.'}</p>
          </div>
        ) : (
          <label className="field">
            <span className="field__label">نبذة</span>
            <Textarea
              value={draft.bio}
              disabled={pendingField !== null}
              aria-busy={pendingField === 'bio'}
              onChange={(event) => setDraft((value) => ({ ...value, bio: event.target.value }))}
              onBlur={() => void commit('bio')}
              placeholder="سطران عن الضيف وسبب استضافته."
            />
          </label>
        )}
      </div>
    </>
  );
}
