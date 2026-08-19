import { useState } from 'react';
import { Button, Input, Select } from '@/shared/ui/primitives';
import {
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type GuestSocial,
  type GuestSocialId,
  type SocialPlatform,
} from '@/lib';

interface GuestSocialsSectionProps {
  socials: GuestSocial[];
  readOnly?: boolean;
  onAdd: () => Promise<void>;
  onUpdate: (
    id: GuestSocialId,
    patch: Partial<Pick<GuestSocial, 'platform' | 'handle'>>,
  ) => Promise<void>;
  onRemove: (id: GuestSocialId) => Promise<void>;
}

interface GuestSocialEditorRowProps {
  social: GuestSocial;
  onUpdate: GuestSocialsSectionProps['onUpdate'];
  onRemove: GuestSocialsSectionProps['onRemove'];
}

function GuestSocialEditorRow({ social, onUpdate, onRemove }: GuestSocialEditorRowProps) {
  const [platform, setPlatform] = useState(social.platform);
  const [handle, setHandle] = useState(social.handle);
  const [pendingAction, setPendingAction] = useState<'platform' | 'handle' | 'remove' | null>(null);
  const [operationError, setOperationError] = useState('');

  async function changePlatform(nextPlatform: SocialPlatform) {
    if (pendingAction || nextPlatform === platform) return;
    const previousPlatform = platform;
    setPlatform(nextPlatform);
    setPendingAction('platform');
    setOperationError('');
    try {
      await onUpdate(social.id, { platform: nextPlatform });
    } catch {
      setPlatform(previousPlatform);
      setOperationError('تعذّر تحديث منصة الحساب. حاول مرة أخرى.');
    } finally {
      setPendingAction(null);
    }
  }

  async function commitHandle() {
    if (pendingAction || handle === social.handle) return;
    setPendingAction('handle');
    setOperationError('');
    try {
      await onUpdate(social.id, { handle });
    } catch {
      setOperationError('تعذّر حفظ اسم الحساب. بقي التعديل في الحقل، حاول مرة أخرى.');
    } finally {
      setPendingAction(null);
    }
  }

  async function removeSocial() {
    if (pendingAction) return;
    setPendingAction('remove');
    setOperationError('');
    try {
      await onRemove(social.id);
    } catch {
      setOperationError('تعذّرت إزالة الحساب. حاول مرة أخرى.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <div className="social-editor-row">
        <Select
          aria-label="منصة الحساب"
          value={platform}
          disabled={pendingAction !== null}
          aria-busy={pendingAction === 'platform'}
          onChange={(event) => void changePlatform(event.target.value as SocialPlatform)}
        >
          {SOCIAL_PLATFORMS.map((availablePlatform) => (
            <option key={availablePlatform} value={availablePlatform}>
              {SOCIAL_PLATFORM_LABELS[availablePlatform]}
            </option>
          ))}
        </Select>
        <Input
          value={handle}
          disabled={pendingAction !== null}
          aria-busy={pendingAction === 'handle'}
          onChange={(event) => setHandle(event.target.value)}
          onBlur={() => void commitHandle()}
          placeholder="@handle"
          dir="ltr"
          aria-label={`حساب ${SOCIAL_PLATFORM_LABELS[platform]}`}
        />
        <Button
          type="button"
          variant="danger"
          disabled={pendingAction !== null}
          aria-busy={pendingAction === 'remove'}
          aria-label={`إزالة حساب ${SOCIAL_PLATFORM_LABELS[platform]}`}
          onClick={() => void removeSocial()}
        >
          {pendingAction === 'remove' ? '…' : '×'}
        </Button>
      </div>
      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}
    </>
  );
}

export function GuestSocialsSection({
  socials,
  readOnly = false,
  onAdd,
  onUpdate,
  onRemove,
}: GuestSocialsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [operationError, setOperationError] = useState('');

  async function addSocial() {
    if (adding) return;
    setAdding(true);
    setOperationError('');
    try {
      await onAdd();
    } catch {
      setOperationError('تعذّر إضافة حساب. حاول مرة أخرى.');
    } finally {
      setAdding(false);
    }
  }

  if (readOnly) {
    return socials.length === 0 ? (
      <p className="picker-summary">لا توجد حسابات مسجلة.</p>
    ) : (
      <div className="list-body" aria-label="حسابات الضيف">
        {socials.map((social) => (
          <p className="row-copy__meta" key={social.id}>
            {SOCIAL_PLATFORM_LABELS[social.platform]}:{' '}
            {social.handle ? <span dir="ltr">{social.handle}</span> : 'غير مسجل'}
          </p>
        ))}
      </div>
    );
  }

  return (
    <>
      {socials.length === 0 ? (
        <p className="picker-summary">لا توجد حسابات مسجلة.</p>
      ) : (
        socials.map((social) => (
          <GuestSocialEditorRow
            key={social.id}
            social={social}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))
      )}
      {operationError ? (
        <p className="notice notice--error" role="alert">
          {operationError}
        </p>
      ) : null}
      <Button type="button" disabled={adding} aria-busy={adding} onClick={() => void addSocial()}>
        {adding ? 'جارٍ الإضافة…' : 'إضافة حساب'}
      </Button>
    </>
  );
}
