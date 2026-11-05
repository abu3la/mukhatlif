import type { ButtonHTMLAttributes } from 'react';
import './busy-button.css';

type BusyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { loadingMode?: 'indicator' | 'replace' };

/** Keep action names accessible while showing a visible pending state. */
export function BusyButton({
  children,
  disabled,
  loadingMode = 'indicator',
  ...props
}: BusyButtonProps) {
  const busy = props['aria-busy'] === true || props['aria-busy'] === 'true';
  const iconOnly = /(?:^|\s)(?:icon-action|customer-icon-button)(?:\s|$)/.test(props.className ?? '');
  return (
    <button {...props} data-loading-mode={loadingMode} data-unavailable={disabled && !busy ? true : undefined} disabled={disabled || busy}>
      {busy && <span className="action-loading-indicator" aria-hidden="true" />}
      {busy && iconOnly ? null : loadingMode === 'replace' ? <span className="action-button-label">{children}</span> : children}
    </button>
  );
}
