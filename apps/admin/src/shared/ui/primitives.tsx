import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import type { ArticleStatus, EpisodeStatus, SubscriptionStatus } from '@/lib';

type ButtonVariant = 'primary' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'quiet', className = '', ...props }: ButtonProps) {
  return <button className={`button button--${variant} ${className}`.trim()} {...props} />;
}

interface PageHeaderProps {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
}

export function PageHeader({
  title,
  detail,
  action,
  headingRef,
  headingTabIndex,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__title-row">
        <h1 ref={headingRef} tabIndex={headingTabIndex}>
          {title}
        </h1>
        {detail ? <div className="page-header__detail">{detail}</div> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

interface PageBreadcrumbProps {
  parentLabel: string;
  parentTo: string;
  current: string;
}

export function PageBreadcrumb({
  parentLabel,
  parentTo,
  current,
}: PageBreadcrumbProps) {
  return (
    <nav className="page-breadcrumb" aria-label="مسار الصفحة">
      <ol>
        <li>
          <Link to={parentTo}>{parentLabel}</Link>
        </li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

type AnyStatus = EpisodeStatus | ArticleStatus | SubscriptionStatus;

const STATUS_LABELS: Record<AnyStatus, string> = {
  draft: 'مسودة',
  scheduled: 'مجدولة',
  published: 'منشورة',
  archived: 'مؤرشفة',
  active: 'نشط',
  past_due: 'متأخر السداد',
  canceled: 'ملغى',
};

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: AnyStatus;
  label?: string;
}

export function StatusBadge({ status, label, className = '', ...props }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${status} ${className}`.trim()} {...props}>
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

export function PremiumMark() {
  return <span className="premium-mark">حصري</span>;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className = '' }: FieldProps) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`control ${className}`.trim()} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`control ${className}`.trim()} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`control textarea ${className}`.trim()} {...props} />;
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'switch--on' : ''}`}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="switch__knob" aria-hidden="true" />
    </button>
  );
}
