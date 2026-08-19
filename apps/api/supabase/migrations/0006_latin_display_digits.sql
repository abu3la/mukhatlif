-- Keep dashboard-visible content numerals in the product's Latin-digit style.
-- Updating the seed alone would not correct databases that already ran 0001.

update public.articles
set title_ar = translate(
  title_ar,
  '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
  '01234567890123456789'
)
where title_ar ~ '[٠-٩۰-۹]';
