import type { ReactNode } from 'react';

export interface PageHeadingProps {
  title: string;
  /** Optional trailing action, e.g. a create Button. */
  action?: ReactNode;
}

export function PageHeading({ title, action }: PageHeadingProps) {
  return (
    <header className="mk-page-heading">
      <h1>{title}</h1>
      {action}
    </header>
  );
}
