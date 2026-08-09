/**
 * IBM Plex Sans Arabic is the brand's real face (it is what mukhtalif.net
 * ships today), self-hosted from assets/fonts — never loaded from a CDN.
 * One family across weights keeps the voice singular; Arabic is the primary
 * script and the face carries Latin natively.
 */
export const fontFamily = {
  sans: "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

export interface FontAsset {
  family: string;
  weight: 400 | 500 | 700;
  /** File name under @mukhtalif/design-tokens/assets/fonts/. */
  file: string;
  /** Subset the file carries, for @font-face unicode-range. */
  subset: 'arabic' | 'latin';
}

export const ARABIC_RANGE =
  'U+0600-06FF, U+0750-077F, U+0870-088E, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF';
export const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2212, U+2215';

export const fontAssets: FontAsset[] = [
  { family: 'IBM Plex Sans Arabic', weight: 400, file: 'ibm-plex-sans-arabic-400-arabic.woff2', subset: 'arabic' },
  { family: 'IBM Plex Sans Arabic', weight: 400, file: 'ibm-plex-sans-arabic-400-latin.woff2', subset: 'latin' },
  { family: 'IBM Plex Sans Arabic', weight: 500, file: 'ibm-plex-sans-arabic-500-arabic.woff2', subset: 'arabic' },
  { family: 'IBM Plex Sans Arabic', weight: 500, file: 'ibm-plex-sans-arabic-500-latin.woff2', subset: 'latin' },
  { family: 'IBM Plex Sans Arabic', weight: 700, file: 'ibm-plex-sans-arabic-700-arabic.woff2', subset: 'arabic' },
  { family: 'IBM Plex Sans Arabic', weight: 700, file: 'ibm-plex-sans-arabic-700-latin.woff2', subset: 'latin' },
];

/** `@font-face` rules given the public URL prefix the app serves the files from. */
export function fontFaceCss(publicPrefix: string): string {
  return fontAssets
    .map(
      (asset) => `@font-face {
  font-family: '${asset.family}';
  font-style: normal;
  font-weight: ${asset.weight};
  font-display: swap;
  src: url('${publicPrefix.replace(/\/$/, '')}/${asset.file}') format('woff2');
  unicode-range: ${asset.subset === 'arabic' ? ARABIC_RANGE : LATIN_RANGE};
}`,
    )
    .join('\n');
}
