import { StyleSheet, Text } from 'react-native';
import { color, fontSize, fontWeight } from '@mukhtalif/design-tokens';

export function Heading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>;
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    color: color.ink,
    writingDirection: 'rtl',
  },
});
