'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { customerError, type CustomerProfilePatch } from '@/lib/customer-utils';
import { useCustomer } from './customer-provider';
import {
  CustomerDialog,
  CustomerField,
  CustomerGate,
  CustomerIcon,
  CustomerPassword,
  validateCustomerForm,
} from './customer-ui';

type AccountEdit = 'name' | 'email' | 'gender' | 'birthDate' | 'password' | 'clear';
const editTitles: Record<AccountEdit, string> = {
  name: 'الاسم',
  email: 'تغيير البريد الإلكتروني',
  gender: 'الجنس',
  birthDate: 'تاريخ الميلاد',
  password: 'تغيير كلمة المرور',
  clear: 'مسح بيانات المكتبة؟',
};
const genderNames = { male: 'ذكر', female: 'أنثى', prefer_not_to_say: 'أفضل عدم الإجابة' };

function AccountRow({
  label,
  value,
  onClick,
  danger = false,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`customer-account-row${danger ? ' customer-danger-row' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <bdi className="customer-account-value">{value}</bdi>
      <CustomerIcon name="back" />
    </button>
  );
}

export function CustomerAccount() {
  const { user } = useCustomer();
  return (
    <CustomerGate>
      <AccountContent key={user?.id} />
    </CustomerGate>
  );
}

function AccountContent() {
  const customer = useCustomer();
  const router = useRouter();
  const [edit, setEdit] = useState<AccountEdit | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const profile = customer.profile!;
  const googleLinked = customer.user?.identities?.some(
    (identity) => identity.provider === 'google',
  );

  async function signOut() {
    if (!customer.client || busy) return;
    setBusy(true);
    setError('');
    const { error: failure } = await customer.client.auth.signOut();
    if (failure) {
      setError(customerError(failure));
      setBusy(false);
      return;
    }
    await customer.refresh();
    router.replace('/');
  }

  return (
    <div className="page customer-page customer-account-page">
      <header className="customer-page-head">
        <h1>حسابي</h1>
      </header>
      <div className="customer-account-layout">
        <section className="customer-account-card">
          <div className="customer-account-identity">
            <span className="customer-account-avatar" aria-hidden="true">
              {profile.displayName.trim().charAt(0)}
            </span>
            <div>
              <h2>{profile.displayName}</h2>
              <p>
                <bdi>{customer.user?.email || profile.email}</bdi>
                {googleLinked && ' · Google'}
              </p>
            </div>
          </div>
          <Link className="customer-primary" href="/library">
            مكتبتي
          </Link>
        </section>
        <section className="customer-account-card customer-account-rows">
          <h2>بياناتي</h2>
          <AccountRow label="الاسم" value={profile.displayName} onClick={() => setEdit('name')} />
          <AccountRow
            label="البريد الإلكتروني"
            value={customer.user?.email || profile.email}
            onClick={() => setEdit('email')}
          />
          <AccountRow
            label="الجنس"
            value={profile.gender ? genderNames[profile.gender] : 'لم يُحدّد'}
            onClick={() => setEdit('gender')}
          />
          <AccountRow
            label="تاريخ الميلاد"
            value={profile.birthDate || 'لم يُحدّد'}
            onClick={() => setEdit('birthDate')}
          />
          {!googleLinked && (
            <AccountRow label="كلمة المرور" value="••••••••" onClick={() => setEdit('password')} />
          )}
        </section>
        <section className="customer-account-card customer-account-rows">
          <h2>الحساب</h2>
          <AccountRow
            label={busy ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
            onClick={() => void signOut()}
          />
          <AccountRow
            label="امسح بيانات المكتبة"
            value="المحفوظات والقوائم والسجل"
            danger
            onClick={() => setEdit('clear')}
          />
          {error && (
            <p className="customer-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      {edit && <AccountEditDialog key={edit} edit={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AccountEditDialog({ edit, onClose }: { edit: AccountEdit; onClose: () => void }) {
  const customer = useCustomer();
  const profile = customer.profile!;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [passwordChallenge, setPasswordChallenge] = useState(false);
  const pendingCredentials = useRef<{ currentPassword: string; password: string } | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pendingCredentials.current = null;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateCustomerForm(event.currentTarget);
    setErrors(invalid);
    setError('');
    setMessage('');
    if (Object.keys(invalid).length || !customer.client) return;
    const fields = new FormData(event.currentTarget);
    const auth = customer.client.auth;
    setBusy(true);
    try {
      if (edit === 'clear') {
        await customer.mutateLibrary('', 'DELETE');
        customer.notify('مسحنا بيانات مكتبتك من حسابك.');
        onClose();
        return;
      }
      if (edit === 'email') {
        if (pendingEmail) {
          const { error: failure } = await auth.verifyOtp({
            type: 'email_change',
            email: pendingEmail,
            token: String(fields.get('code')).trim(),
          });
          if (failure) throw failure;
          const refreshed = await auth.refreshSession();
          if (refreshed.error) throw refreshed.error;
          await customer.refresh();
          const { data, error: userError } = await auth.getUser();
          if (userError) throw userError;
          if (data.user?.email?.toLowerCase() === pendingEmail.toLowerCase()) {
            customer.notify('حفظنا بريدك الإلكتروني الجديد.');
            onClose();
          } else {
            setMessage(
              'أكدنا هذا البريد. راجع رسالة التأكيد الأخرى في بريدك الحالي أو الجديد لإكمال التغيير.',
            );
          }
        } else {
          const email = String(fields.get('email')).trim();
          if (email.toLowerCase() === customer.user?.email?.toLowerCase()) {
            setErrors({ email: 'هذا بريدك الحالي.' });
            return;
          }
          const { error: failure } = await auth.updateUser(
            { email },
            { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Faccount` },
          );
          if (failure) throw failure;
          setPendingEmail(email);
          setMessage('أرسلنا التأكيد. قد تحتاج إلى تأكيد الرسالتين في بريدك الحالي والجديد.');
        }
        return;
      }
      if (edit === 'password') {
        if (!passwordChallenge) {
          const currentPassword = String(fields.get('currentPassword'));
          const password = String(fields.get('password'));
          const verified = await auth.signInWithPassword({
            email: customer.user!.email!,
            password: currentPassword,
          });
          if (verified.error) throw verified.error;
          if (!active.current) return;
          const challenge = await auth.reauthenticate();
          if (challenge.error) throw challenge.error;
          if (!active.current) return;
          pendingCredentials.current = { currentPassword, password };
          setPasswordChallenge(true);
          setMessage('أرسلنا رمزًا إلى بريدك لتأكيد تغيير كلمة المرور.');
        } else {
          const credentials = pendingCredentials.current;
          if (!credentials || !active.current) return;
          const { error: failure } = await auth.updateUser({
            password: credentials.password,
            current_password: credentials.currentPassword,
            nonce: String(fields.get('code')).trim(),
          });
          if (failure) throw failure;
          pendingCredentials.current = null;
          if (!active.current) return;
          customer.notify('حفظنا كلمة المرور الجديدة.');
          onClose();
        }
        return;
      }
      const patch: CustomerProfilePatch =
        edit === 'name'
          ? { displayName: String(fields.get('name')).trim() }
          : edit === 'gender'
            ? { gender: (String(fields.get('gender')) || null) as CustomerProfilePatch['gender'] }
            : { birthDate: String(fields.get('birthDate')) || null };
      await customer.updateProfile(patch);
      customer.notify('حفظنا التغييرات.');
      onClose();
    } catch (failure) {
      setError(customerError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CustomerDialog
      title={edit === 'email' && pendingEmail ? 'أكّد بريدك الجديد' : editTitles[edit]}
      onClose={() => {
        if (!busy) {
          pendingCredentials.current = null;
          onClose();
        }
      }}
    >
      <form onSubmit={submit} noValidate aria-busy={busy}>
        {edit === 'name' && (
          <CustomerField
            name="name"
            label="الاسم"
            defaultValue={profile.displayName}
            autoComplete="name"
            required
            maxLength={100}
            error={errors.name}
          />
        )}
        {edit === 'gender' && (
          <div className="customer-field">
            <label htmlFor="customer-gender">الجنس</label>
            <select id="customer-gender" name="gender" defaultValue={profile.gender || ''}>
              <option value="">لم يُحدّد</option>
              {Object.entries(genderNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {edit === 'birthDate' && (
          <CustomerField
            name="birthDate"
            label="تاريخ الميلاد"
            type="date"
            dir="ltr"
            defaultValue={profile.birthDate || ''}
            max={new Date().toISOString().slice(0, 10)}
            error={errors.birthDate}
            hint="اختياري."
          />
        )}
        {edit === 'email' &&
          (pendingEmail ? (
            <>
              <p className="customer-muted">
                أدخل الرمز المرسل إلى <bdi>{pendingEmail}</bdi>، أو افتح رابط التأكيد في الرسالة.
              </p>
              <CustomerField
                key="email-change-code"
                name="code"
                label="رمز التأكيد"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                minLength={6}
                maxLength={10}
                required
                error={errors.code}
              />
            </>
          ) : (
            <>
              <p className="customer-muted">نرسل تأكيدًا إلى البريد الجديد قبل تغييره.</p>
              <CustomerField
                key="email-change-address"
                name="email"
                label="البريد الإلكتروني الجديد"
                type="email"
                dir="ltr"
                required
                maxLength={254}
                placeholder="name@example.com"
                error={errors.email}
              />
            </>
          ))}
        {edit === 'password' &&
          (passwordChallenge ? (
            <CustomerField
              name="code"
              label="رمز تأكيد الهوية"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={10}
              error={errors.code}
            />
          ) : (
            <>
              <CustomerPassword
                name="currentPassword"
                label="كلمة المرور الحالية"
                current
                error={errors.currentPassword}
              />
              <CustomerPassword label="كلمة المرور الجديدة" error={errors.password} />
            </>
          ))}
        {edit === 'clear' && (
          <p>
            سنمسح الحلقات والقراءات المحفوظة، والمتابعات، وقوائم التشغيل، واللحظات، وسجل الاستماع من
            حسابك على كل أجهزتك. لا يمكن التراجع. سيبقى حسابك واهتماماتك.
          </p>
        )}
        {error && (
          <p className="customer-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="customer-message" role="status">
            {message}
          </p>
        )}
        <button
          className={`customer-primary${edit === 'clear' ? ' customer-destructive' : ''}`}
          disabled={busy}
        >
          {busy
            ? 'جارٍ الحفظ…'
            : edit === 'clear'
              ? 'امسح المكتبة'
              : edit === 'email'
                ? pendingEmail
                  ? 'أكّد البريد'
                  : 'أرسل التأكيد'
                : edit === 'password' && !passwordChallenge
                  ? 'أرسل رمز التأكيد'
                  : 'احفظ'}
        </button>
        {edit === 'email' && pendingEmail ? (
          <button
            type="button"
            className="customer-text-button"
            disabled={busy}
            onClick={() => {
              setPendingEmail('');
              setMessage('');
              setError('');
            }}
          >
            غيّر البريد
          </button>
        ) : (
          <button type="button" className="customer-text-button" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
        )}
      </form>
    </CustomerDialog>
  );
}
