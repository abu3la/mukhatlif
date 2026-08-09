import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { color, space } from '@mukhtalif/design-tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Scrollable content (default). Set false for fixed layouts. */
  scroll?: boolean;
}

export function Screen({ children, scroll = true }: ScreenProps) {
  if (scroll) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, styles.content]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.paper,
  },
  content: {
    padding: space.md,
    gap: space.md,
  },
});
