export type NewsletterExportFormat = 'html' | 'text';

const EXPORT_METADATA: Record<NewsletterExportFormat, { extension: string; mimeType: string }> = {
  html: { extension: 'html', mimeType: 'text/html;charset=utf-8' },
  text: { extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
};

function requireContent(content: string): void {
  if (!content.trim()) throw new Error('Newsletter export is empty.');
}

/** A deterministic, safe filename for a server-rendered newsletter export. */
export function newsletterExportFilename(slug: string, format: NewsletterExportFormat): string {
  const normalizedSlug = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const { extension } = EXPORT_METADATA[format];
  return `mukhtalif-newsletter-${normalizedSlug || 'draft'}.${extension}`;
}

/** Copies the exact server-rendered output, falling back for restricted browsers. */
export async function copyNewsletterExport(content: string): Promise<void> {
  requireContent(content);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected.');
  } finally {
    textarea.remove();
  }
}

/** Downloads the exact server-rendered HTML or plain-text alternative. */
export function downloadNewsletterExport(
  content: string,
  slug: string,
  format: NewsletterExportFormat,
): void {
  requireContent(content);
  const { mimeType } = EXPORT_METADATA[format];
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = newsletterExportFilename(slug, format);
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
