import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleMediaAsset } from '@/data';
import { ArticleImageGalleryDialog } from './article-image-gallery-dialog';

function asset(index: number, defaultAlt = `وصف الصورة ${index}`): ArticleMediaAsset {
  return {
    id: `med-0000000000000000000000000000000${index}`,
    kind: 'image',
    mimeType: 'image/png',
    fileName: `gallery-${index}.png`,
    byteSize: 4_000,
    width: 1_200,
    height: 800,
    defaultAlt,
    status: 'ready',
    publicUrl: `data:image/png;base64,IMAGE${index}`,
    createdAt: '2026-08-18T08:00:00.000Z',
  };
}

function stubImageDimensions(width = 1_200, height = 800) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:gallery-upload'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  class LoadedImage extends EventTarget {
    naturalWidth = width;
    naturalHeight = height;
    set src(_value: string) {
      queueMicrotask(() => this.dispatchEvent(new Event('load')));
    }
  }
  vi.stubGlobal('Image', LoadedImage);
}

describe('ArticleImageGalleryDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a gallery only after two unique images have complete alternative text', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const assets = [asset(1), asset(2, ''), asset(3)];
    render(
      <ArticleImageGalleryDialog
        assets={assets}
        disabled={false}
        maximumItems={3}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={vi.fn(async () => asset(4))}
        onCommit={onCommit}
      />,
    );

    const commit = screen.getByRole('button', { name: 'إضافة المعرض' });
    expect(commit).toBeDisabled();
    expect(commit).toHaveClass('button--primary');
    await user.click(screen.getByRole('option', { name: 'gallery-1.png' }));
    expect(commit).toBeDisabled();
    const firstOption = screen.getByRole('option', { name: /gallery-1\.png، الصورة 1/ });
    expect(firstOption).toBeDisabled();
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('option', { name: 'gallery-2.png' }));
    const firstAlt = screen.getByRole('textbox', {
      name: 'الوصف البديل للصورة 1 (مطلوب)',
    });
    const secondAlt = screen.getByRole('textbox', {
      name: 'الوصف البديل للصورة 2 (مطلوب)',
    });
    expect(firstAlt).toHaveValue('وصف الصورة 1');
    expect(secondAlt).toHaveAttribute('aria-invalid', 'true');
    expect(commit).toBeDisabled();

    await user.type(secondAlt, 'مشهد ثانٍ من الاستوديو');
    await user.type(
      screen.getByRole('textbox', { name: /^وصف المجموعة \(اختياري\)/ }),
      'لقطات من جلسة الأسبوع',
    );
    expect(commit).toBeEnabled();
    await user.click(commit);

    expect(onCommit).toHaveBeenCalledWith({
      items: [
        { mediaId: assets[0]!.id, alt: 'وصف الصورة 1' },
        { mediaId: assets[1]!.id, alt: 'مشهد ثانٍ من الاستوديو' },
      ],
      caption: 'لقطات من جلسة الأسبوع',
    });
  });

  it('orders gallery upload controls and keeps upload inactive until the file and alternative text are ready', async () => {
    stubImageDimensions();
    const user = userEvent.setup();
    const upload = vi.fn();
    render(
      <ArticleImageGalleryDialog
        assets={[]}
        disabled={false}
        maximumItems={3}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={upload}
        onCommit={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText('اختيار صورة'),
      new File(['gallery'], 'gallery-upload.png', { type: 'image/png' }),
    );
    const fileInput = screen.getByLabelText('اختيار صورة');
    const alternativeTextInput = screen.getByRole('textbox', {
      name: 'الوصف البديل للصورة المرفوعة (مطلوب)',
    });
    const uploadButton = await screen.findByRole('button', { name: 'رفع الصورة' });
    expect(uploadButton).toBeDisabled();
    expect(
      fileInput.compareDocumentPosition(alternativeTextInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      alternativeTextInput.compareDocumentPosition(uploadButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await user.type(alternativeTextInput, 'صورة مرفوعة إلى المعرض');
    expect(uploadButton).toBeEnabled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('blocks library selection during a deferred upload and never adds a fourth image', async () => {
    stubImageDimensions();
    const user = userEvent.setup();
    const uploaded = asset(4, 'صورة مرفوعة');
    let resolveUpload: ((value: ArticleMediaAsset) => void) | undefined;
    const onUpload = vi.fn(
      () =>
        new Promise<ArticleMediaAsset>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    render(
      <ArticleImageGalleryDialog
        attributes={{
          items: [
            { mediaId: asset(1).id, alt: 'الأولى' },
            { mediaId: asset(2).id, alt: 'الثانية' },
          ],
        }}
        assets={[asset(1), asset(2), asset(3)]}
        disabled={false}
        maximumItems={3}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={onUpload}
        onCommit={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'الوصف البديل للصورة المرفوعة (مطلوب)' }),
      'صورة مرفوعة',
    );
    await user.upload(
      screen.getByLabelText('اختيار صورة'),
      new File(['gallery'], 'upload.png', { type: 'image/png' }),
    );
    const upload = await screen.findByRole('button', { name: 'رفع الصورة' });
    expect(upload).toHaveClass('button--primary');
    await user.click(upload);

    const thirdLibraryOption = screen.getByRole('option', { name: 'gallery-3.png' });
    expect(thirdLibraryOption).toBeDisabled();
    await user.click(thirdLibraryOption);
    expect(screen.getAllByRole('textbox', { name: /الوصف البديل للصورة \d/ })).toHaveLength(2);

    await act(async () => resolveUpload?.(uploaded));
    await waitFor(() =>
      expect(screen.getAllByRole('textbox', { name: /الوصف البديل للصورة \d/ })).toHaveLength(3),
    );
    expect(screen.getByText('اخترت 3 صور. اكتمل المعرض.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeEnabled();
  });

  it('handles Escape and backdrop dismissal through explicit close paths', () => {
    const onClose = vi.fn();
    render(
      <ArticleImageGalleryDialog
        assets={[]}
        disabled={false}
        maximumItems={3}
        onClose={onClose}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={vi.fn(async () => asset(1))}
        onCommit={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'إضافة معرض صور' });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(within(dialog).getByRole('heading', { name: 'إضافة معرض صور' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
