import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyNewsletterExport,
  downloadNewsletterExport,
  newsletterExportFilename,
} from './article-newsletter-export';

function replaceClipboard(writeText: ReturnType<typeof vi.fn>): () => void {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return () => {
    if (previous) Object.defineProperty(navigator, 'clipboard', previous);
    else Reflect.deleteProperty(navigator, 'clipboard');
  };
}

describe('article newsletter export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses a safe deterministic filename for each export format', () => {
    expect(newsletterExportFilename('Weekly Update', 'html')).toBe(
      'mukhtalif-newsletter-weekly-update.html',
    );
    expect(newsletterExportFilename('', 'text')).toBe('mukhtalif-newsletter-draft.txt');
  });

  it('copies the exact server-rendered output through the Clipboard API', async () => {
    const writeText = vi.fn(async () => undefined);
    const restoreClipboard = replaceClipboard(writeText);

    await copyNewsletterExport('<p>رسالة موثوقة</p>');

    expect(writeText).toHaveBeenCalledWith('<p>رسالة موثوقة</p>');
    restoreClipboard();
  });

  it('downloads an HTML file with the exact content and a UTF-8 MIME type', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:newsletter');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadNewsletterExport('<p>رسالة موثوقة</p>', 'weekly-update', 'html');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/html;charset=utf-8');
    expect(await blob.text()).toBe('<p>رسالة موثوقة</p>');
    expect(click).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:newsletter');
  });
});
