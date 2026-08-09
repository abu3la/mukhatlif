import { Pressable, StyleSheet, Text } from 'react-native';
import { color, fontSize, fontWeight, radius, space } from '@mukhtalif/design-tokens';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'quiet';
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'solid', disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'solid' ? styles.solid : styles.quiet,
        pressed && (variant === 'solid' ? styles.solidPressed : styles.quietPressed),
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, variant === 'quiet' && styles.quietLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  solid: {
    backgroundColor: color.ink,
  },
  solidPressed: {
    backgroundColor: '#262B73',
  },
  quiet: {
    backgroundColor: 'transparent',
  },
  quietPressed: {
    backgroundColor: color.surfaceSunken,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    color: '#fff',
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
  },
  quietLabel: {
    color: color.ink,
  },
});
