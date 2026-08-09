import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EpisodeStatus } from '@mukhtalif/types';
import { color, fontSize, fontWeight, space } from '@mukhtalif/design-tokens';
import { translate, type Locale } from '@mukhtalif/i18n';
import { StatusBadge } from './StatusBadge';

export interface EpisodeRowProps {
  title: string;
  /** Formatted meta line — show name, duration, date; the caller formats. */
  meta: string;
  status?: EpisodeStatus;
  premium?: boolean;
  locale?: Locale;
  action?: ReactNode;
}

/** One episode in a list. Presentation only: strings in, no fetching. */
export function EpisodeRow({ title, meta, status, premium, locale = 'ar', action }: EpisodeRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>
          {title}
          {premium ? (
            <Text style={styles.premium}>  {translate(locale, 'label.premium')}</Text>
          ) : null}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {status ? <StatusBadge status={status} locale={locale} /> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.emphasis,
    fontWeight: fontWeight.medium,
    color: color.ink,
    writingDirection: 'rtl',
    textAlign: 'left',
  },
  premium: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: color.greenInk,
  },
  meta: {
    marginTop: 4,
    fontSize: fontSize.caption,
    color: color.inkSoft,
    writingDirection: 'rtl',
    textAlign: 'left',
  },
});
