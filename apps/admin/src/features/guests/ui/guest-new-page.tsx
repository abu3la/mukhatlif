import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminPaths, useStudioData } from '@/application';
import { isAdminRepositoryError, type CreateGuestCommand } from '@/data';
import { Button, Field, Input, PageBreadcrumb, Textarea } from '@/shared/ui/primitives';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const ROLE_MAX_LENGTH = 120;
const CITY_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const BIO_MAX_LENGTH = 1_000;

interface GuestFormErrors {
  name?: string;
  email?: string;
}

export function guestCreateErrorMessage(error: unknown): string {
  if (isAdminRepositoryError(error)) {
    if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED') {
      return 'لا يمكنك إضافة ضيوف.';
    }
    if (error.code === 'VALIDATION') {
      return 'راجع بيانات الضيف ثم حاول مرة أخرى.';
    }
  }
  return 'تعذّرت إضافة الضيف. حاول مرة أخرى.';
}

function isValidEmail(value: string): boolean {
  if (!value) return true;
  if (value.length > EMAIL_MAX_LENGTH || value.includes('..')) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (
    !localPart ||
    !domain ||
    !/^[^\s@]+$/.test(localPart) ||
    localPart.startsWith('.') ||
    localPart.endsWith('.')
  ) {
    return false;
  }

  const domainParts = domain.split('.');
  return (
    domainParts.length >= 2 &&
    domainParts.every(
      (part) =>
        part.length > 0 &&
        !part.startsWith('-') &&
        !part.endsWith('-') &&
        /^[a-zA-Z0-9-]+$/.test(part),
    )
  );
}

export function GuestNewView() {
  const navigate = useNavigate();
  const { createGuest } = useStudioData();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<GuestFormErrors>({});
  const [operationError, setOperationError] = useState('');

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const command: CreateGuestCommand = {
      name: name.trim(),
      role: role.trim(),
      city: city.trim(),
      email: email.trim().toLowerCase(),
      bio: bio.trim(),
    };
    const nextErrors: GuestFormErrors = {};
    if (!command.name || command.name.length < NAME_MIN_LENGTH) {
      nextErrors.name = 'أدخل اسم الضيف بحرفين على الأقل.';
    }
    if (!isValidEmail(command.email ?? '')) {
      nextErrors.email = 'أدخل بريدًا إلكترونيًا صحيحًا.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setOperationError('راجع الحقول الموضحة.');
      return;
    }

    setPending(true);
    setErrors({});
    setOperationError('');
    try {
      const guestId = await createGuest(command);
      navigate(adminPaths.guest(guestId), { replace: true });
    } catch (error) {
      setOperationError(guestCreateErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="guest-new-page">
      <PageBreadcrumb
        parentLabel="الضيوف"
        parentTo={adminPaths.guests}
        current="ضيف جديد"
      />
      <header className="page-header">
        <div className="page-header__title-row">
          <h1 ref={headingRef} tabIndex={-1}>
            ضيف جديد
          </h1>
          <div className="page-header__detail">أنشئ ملفًا للضيف قبل ربطه بالحلقات.</div>
        </div>
      </header>

      <form
        className="card guest-create-form"
        aria-label="بيانات الضيف الجديد"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <Field label="اسم الضيف" className="guest-create-form__name">
          <Input
            name="name"
            aria-label="اسم الضيف"
            autoComplete="name"
            value={name}
            required
            minLength={NAME_MIN_LENGTH}
            maxLength={NAME_MAX_LENGTH}
            disabled={pending}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'guest-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setErrors((current) => ({ ...current, name: undefined }));
              setOperationError('');
            }}
          />
          {errors.name ? (
            <span className="guest-create-form__field-error" id="guest-name-error">
              {errors.name}
            </span>
          ) : null}
        </Field>

        <Field label="المسمى">
          <Input
            name="role"
            aria-label="المسمى"
            value={role}
            maxLength={ROLE_MAX_LENGTH}
            disabled={pending}
            placeholder="مثال: باحث اقتصادي"
            onChange={(event) => {
              setRole(event.target.value);
              setOperationError('');
            }}
          />
        </Field>

        <Field label="المدينة">
          <Input
            name="city"
            aria-label="المدينة"
            autoComplete="address-level2"
            value={city}
            maxLength={CITY_MAX_LENGTH}
            disabled={pending}
            onChange={(event) => {
              setCity(event.target.value);
              setOperationError('');
            }}
          />
        </Field>

        <Field label="البريد الإلكتروني" hint="اختياري">
          <Input
            name="email"
            aria-label="البريد الإلكتروني"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            maxLength={EMAIL_MAX_LENGTH}
            disabled={pending}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'guest-email-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrors((current) => ({ ...current, email: undefined }));
              setOperationError('');
            }}
          />
          {errors.email ? (
            <span className="guest-create-form__field-error" id="guest-email-error">
              {errors.email}
            </span>
          ) : null}
        </Field>

        <Field label="نبذة" className="guest-create-form__bio">
          <Textarea
            name="bio"
            aria-label="نبذة"
            value={bio}
            maxLength={BIO_MAX_LENGTH}
            disabled={pending}
            rows={5}
            onChange={(event) => {
              setBio(event.target.value);
              setOperationError('');
            }}
          />
        </Field>

        <div className="guest-create-form__footer">
          <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
            {pending ? 'جارٍ الإضافة…' : 'إضافة الضيف'}
          </Button>
          <div className="guest-create-form__feedback" aria-live="polite">
            {operationError ? (
              <p className="notice notice--error" role="alert">
                {operationError}
              </p>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
