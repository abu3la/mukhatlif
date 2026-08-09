import type { ReactNode } from 'react';
import type { EpisodeStatus } from '@mukhtalif/types';
import type { Locale } from '@mukhtalif/i18n';
import { translate } from '@mukhtalif/i18n';
import { StatusBadge } from './StatusBadge';

export interface EpisodeRowProps {
  title: string;
  /** Formatted meta line — show name, duration, date; the caller formats. */
  meta: string;
  status?: EpisodeStatus;
  premium?: boolean;
  locale?: Locale;
  /** Trailing action, e.g. a play Button. */
  action?: ReactNode;
}

/** One episode in a list. Presentation only: strings in, no fetching. */
export function EpisodeRow({ title, meta, status, premium, locale = 'ar', action }: EpisodeRowProps) {
  return (
    <div className="mk-episode-row">
      <div className="mk-episode-row__text">
        <p className="mk-episode-row__title">
          {title}
          {premium ? <span className="mk-premium">{translate(locale, 'label.premium')}</span> : null}
        </p>
        <p className="mk-episode-row__meta">{meta}</p>
      </div>
      {status ? <StatusBadge status={status} locale={locale} /> : null}
      {action}
    </div>
  );
}
