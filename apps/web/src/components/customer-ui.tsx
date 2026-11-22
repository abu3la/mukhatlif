'use client';

import { ContentSkeleton } from './content-skeleton';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Diamond, MazeDrawing } from './maze-drawing';
import { SIGNIN_DRAWINGS } from '@/lib/auth-maze';
import { useCustomer } from './customer-provider';

export function CustomerIcon({
  name,
}: {
  name: 'save' | 'check' | 'up' | 'down' | 'close' | 'back' | 'play' | 'queue';
}) {
  const paths = {
    save: 'M6 3h12v18l-6-4-6 4V3Z',
    check: 'm4 12 5 5L20 6',
    up: 'm5 14 7-7 7 7',
    down: 'm5 10 7 7 7-7',
    close: 'm6 6 12 12M6 18 18 6',
    back: 'm14 5-7 7 7 7',
    play: 'm8 4 12 8-12 8V4Z',
    queue: 'M4 5h16M4 11h16M4 17h8m5-2v6m-3-3h6',
  };
  return (
    <svg
      className="customer-icon"
      viewBox="0 0 24 24"
      fill={name === 'play' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function CustomerDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="customer-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="customer-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="customer-icon-button" onClick={onClose} aria-label="إغلاق">
          <CustomerIcon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function CustomerField({
  name,
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="customer-field">
      <label htmlFor={id}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        {...props}
        id={id}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint ${id}-error`}
      />
      <small id={`${id}-hint`}>{hint}</small>
      <span id={`${id}-error`} className="customer-field-error">
        {error}
      </span>
    </div>
  );
}

export function CustomerPassword({
  name = 'password',
  label = 'كلمة المرور',
  current = false,
  error,
}: {
  name?: string;
  label?: string;
  current?: boolean;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="customer-field">
      <label htmlFor={id}>
        {label} <span aria-hidden="true">*</span>
      </label>
      <div className="customer-password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          name={name}
          placeholder="********"
          minLength={current ? 1 : 8}
          maxLength={256}
          required
          autoComplete={current ? 'current-password' : 'new-password'}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint ${id}-error`}
        />
        <button
          type="button"
          className="customer-password-toggle"
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? 'إخفاء' : 'إظهار'}
          <span className="visually-hidden"> {label}</span>
        </button>
      </div>
      {!current && <small id={`${id}-hint`}>8 أحرف على الأقل.</small>}
      <span id={`${id}-error`} className="customer-field-error">
        {error}
      </span>
    </div>
  );
}

export function validateCustomerForm(form: HTMLFormElement): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of Array.from(form.elements)) {
    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) ||
      !field.name ||
      field.disabled
    )
      continue;
    if (
      field.validity.valueMissing ||
      (field.required && field.type !== 'checkbox' && !field.value.trim())
    )
      errors[field.name] =
        field.type === 'checkbox' ? 'وافق على الشروط للمتابعة.' : 'أكمل هذا الحقل.';
    else if (field.validity.typeMismatch && field.type === 'email')
      errors[field.name] = 'أدخل بريدًا إلكترونيًا صحيحًا.';
    else if (
      field.validity.tooShort ||
      (field instanceof HTMLInputElement &&
        field.minLength > 0 &&
        field.value.length < field.minLength)
    )
      errors[field.name] =
        `اكتب ${field instanceof HTMLInputElement ? field.minLength : 8} أحرف على الأقل.`;
    else if (!field.validity.valid) errors[field.name] = 'راجع قيمة هذا الحقل.';
  }
  const first = Object.keys(errors)[0];
  if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus();
  return errors;
}

/**
 * The sign-in pages on the presentation site (D-24): the maze stage, where the
 * route that runs through the site arrives at the form. On phones the form is
 * the sheet under the drawing.
 */
export function CustomerAuthFrame({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="stage-page auth-page">
      <section className="stage-scope auth-stage" aria-labelledby="auth-title">
        <MazeDrawing maze={SIGNIN_DRAWINGS.wide} variant="wide" />
        <MazeDrawing maze={SIGNIN_DRAWINGS.phone} variant="phone" />
        <Diamond className="auth-stage__stop" />
        <div className="auth-card">
          <h1 id="auth-title" className="auth-card__title">
            {title}
          </h1>
          <p className="auth-card__intro">{intro}</p>
          <div className="auth-card__body">{children}</div>
        </div>
      </section>
    </div>
  );
}

/**
 * Shows its children to a signed-in customer. `bare` is for a page that
 * already has its own heading and frame (the library's stage and sheet): the
 * waiting, sign-in and error states then sit in its content column with a
 * second-level heading.
 */
export function CustomerGate({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const customer = useCustomer();
  const router = useRouter();
  const [destination, setDestination] = useState('/account');
  useEffect(() => {
    setDestination(`${window.location.pathname}${window.location.search}`);
  }, []);
  useEffect(() => {
    if (!customer.loading && !customer.user)
      router.replace(
        `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
      );
  }, [customer.loading, customer.user, router]);
  const Title = bare ? 'h2' : 'h1';
  const frame = (content: ReactNode) => (
    <div className={bare ? 'content-container' : 'page customer-page'}>{content}</div>
  );
  if (customer.loading)
    return frame(<ContentSkeleton label="تحميل حسابك" variant="account" />);
  if (!customer.user)
    return frame(
      <div className="customer-empty">
        <Title>تسجيل الدخول إلى المكتبة</Title>
        <p>تسجيل الدخول يتيح حفظ الحلقات ومتابعة الاستماع من أي جهاز.</p>
        <Link className="customer-primary" href={`/login?next=${encodeURIComponent(destination)}`}>
          تسجيل الدخول
        </Link>
      </div>,
    );
  if (customer.error || !customer.profile)
    return frame(
      <div className="customer-empty">
        <Title>تعذر تحميل الحساب</Title>
        <p role="alert">{customer.error || 'إعادة المحاولة بعد قليل.'}</p>
        <button className="customer-primary" onClick={() => void customer.refresh()}>
          إعادة المحاولة
        </button>
      </div>,
    );
  return children;
}

export function CustomerEmpty({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children?: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <section className="customer-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {href && (
        <Link className="customer-primary" href={href}>
          {action || 'تصفح الحلقات'}
        </Link>
      )}
    </section>
  );
}
