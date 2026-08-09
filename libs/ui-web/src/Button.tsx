import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `solid` — the brand pill, indigo fill.
   * `quiet` — text-only, for secondary actions.
   * `danger` — destructive confirmation.
   */
  variant?: 'solid' | 'quiet' | 'danger';
}

export function Button({ variant = 'solid', className, ...props }: ButtonProps) {
  const classes = ['mk-button', `mk-button--${variant}`, className].filter(Boolean).join(' ');
  return <button className={classes} {...props} />;
}
