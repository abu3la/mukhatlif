import { coverColor } from '@mukhtalif/design-tokens';
import { describe, expect, it } from 'vitest';
import { COMMUNITIES, coverTone } from './communities';

const tokens = coverColor as Record<string, { light: string; dark: string }>;
const programmes = COMMUNITIES.flatMap((community) => community.programmes);

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('programme cover colours (D-24)', () => {
  it('gives every programme a ground and an accent, and nothing else', () => {
    const slugs = new Set(programmes.map((programme) => programme.slug));
    for (const slug of slugs) {
      expect(tokens[`${slug}-ground`], slug).toBeDefined();
      expect(tokens[`${slug}-accent`], slug).toBeDefined();
    }
    const tokenSlugs = Object.keys(tokens)
      .filter((key) => key.endsWith('-ground'))
      .map((key) => key.replace(/-ground$/, ''));
    expect(new Set(tokenSlugs)).toEqual(slugs);
  });

  it('keeps the large count readable and all other text at 4.5:1 on its ground', () => {
    const inkOnDark = tokens.inkOnDark.light;
    const inkOnLight = tokens.inkOnLight.light;
    for (const programme of programmes) {
      const ground = tokens[`${programme.slug}-ground`].light;
      const accent = tokens[`${programme.slug}-accent`].light;
      const ink = coverTone(programme) === 'light' ? inkOnLight : inkOnDark;
      expect(contrast(accent, ground), programme.slug).toBeGreaterThanOrEqual(3);
      expect(contrast(ink, ground), programme.slug).toBeGreaterThanOrEqual(4.5);
    }
  });
});
