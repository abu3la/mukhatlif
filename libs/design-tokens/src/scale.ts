/** Unitless numbers; the CSS serializer appends px, React Native uses them raw. */

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const radius = {
  /** Badges, inputs. */
  sm: 8,
  /** Cards, panels. */
  md: 14,
  /** Buttons — the brand's pill, straight from mukhtalif.net. */
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  body: 15,
  emphasis: 17,
  title: 22,
  heading: 30,
  display: 44,
} as const;

/** String values for React Native compatibility. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;
