import { StyleSheet, Text, View } from 'react-native';
import type { EpisodeStatus } from '@mukhtalif/types';
import { episodeStatusColor, fontSize, fontWeight, radius } from '@mukhtalif/design-tokens';
import { translate, type Locale, type MessageKey } from '@mukhtalif/i18n';

const EPISODE_KEYS: Record<EpisodeStatus, MessageKey> = {
  draft: 'episode.status.draft',
  scheduled: 'episode.status.scheduled',
  published: 'episode.status.published',
  archived: 'episode.status.archived',
};

export interface StatusBadgeProps {
  status: EpisodeStatus;
  locale?: Locale;
}

export function StatusBadge({ status, locale = 'ar' }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: episodeStatusColor[status] }]}>
      <Text style={styles.label}>{translate(locale, EPISODE_KEYS[status])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  label: {
    color: '#fff',
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
});
