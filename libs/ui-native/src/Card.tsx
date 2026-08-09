import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { color, radius, space } from '@mukhtalif/design-tokens';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderColor: color.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
});
