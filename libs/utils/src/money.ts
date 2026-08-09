const INTL_LOCALES = { ar: 'ar-SA', en: 'en-US' } as const;

export type FormatLocale = keyof typeof INTL_LOCALES;

/** Formats a minor-unit amount (halalas) as a localized currency string. */
export function formatMoney(
  priceMinor: number,
  currency: string,
  locale: FormatLocale = 'ar',
): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], {
    style: 'currency',
    currency,
  }).format(priceMinor / 100);
}
