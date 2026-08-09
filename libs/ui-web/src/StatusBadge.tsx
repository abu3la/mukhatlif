import type { EpisodeStatus, SubscriptionStatus } from '@mukhtalif/types';
import { episodeStatusColor, subscriptionStatusColor } from '@mukhtalif/design-tokens';
import { translate, type Locale, type MessageKey } from '@mukhtalif/i18n';

const EPISODE_KEYS: Record<EpisodeStatus, MessageKey> = {
  draft: 'episode.status.draft',
  scheduled: 'episode.status.scheduled',
  published: 'episode.status.published',
  archived: 'episode.status.archived',
};

const SUBSCRIPTION_KEYS: Record<SubscriptionStatus, MessageKey> = {
  active: 'subscription.status.active',
  past_due: 'subscription.status.past_due',
  canceled: 'subscription.status.canceled',
};

export interface StatusBadgeProps {
  status: EpisodeStatus;
  locale?: Locale;
}

export function StatusBadge({ status, locale = 'ar' }: StatusBadgeProps) {
  return (
    <span className="mk-badge" style={{ background: episodeStatusColor[status] }}>
      {translate(locale, EPISODE_KEYS[status])}
    </span>
  );
}

export interface SubscriptionBadgeProps {
  status: SubscriptionStatus;
  locale?: Locale;
}

export function SubscriptionBadge({ status, locale = 'ar' }: SubscriptionBadgeProps) {
  return (
    <span className="mk-badge" style={{ background: subscriptionStatusColor[status] }}>
      {translate(locale, SUBSCRIPTION_KEYS[status])}
    </span>
  );
}
