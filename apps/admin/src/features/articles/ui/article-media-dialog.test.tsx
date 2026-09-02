import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminRepositoryError,
  type ArticleMediaAsset,
  type UploadArticleImageCommand,
} from '@/data';
import { ArticleMediaDialog } from './article-media-dialog';

describe('ArticleMediaDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the video title as the uploaded poster accessibility default', async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn(() => 'blob:poster');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });

    class LoadedImage extends EventTarget {
      naturalWidth = 1600;
      naturalHeight = 900;
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      }
    }
    vi.stubGlobal('Image', LoadedImage);

    const uploaded: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000001',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'poster.png',
      byteSize: 4,
      width: 1600,
      height: 900,
      defaultAlt: 'حلقة مستقبل العمل',
      status: 'ready',
      publicUrl: 'data:image/png;base64,AAAA',
      createdAt: '2026-08-17T12:00:00.000Z',
    };
    const upload = vi.fn(async (command: UploadArticleImageCommand) => {
      command.onProgress?.(100);
      return uploaded;
    });

    render(
      <ArticleMediaDialog
        value={{ kind: 'video' }}
        assets={[]}
        disabled={false}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={upload}
        onCommit={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: /^عنوان الفيديو/ }), 'حلقة مستقبل العمل');
    await user.upload(
      screen.getByLabelText('اختيار صورة من الجهاز'),
      new File(['poster'], 'poster.png', { type: 'image/png' }),
    );
    const uploadButton = await screen.findByRole('button', { name: 'رفع الصورة' });
    expect(uploadButton).toBeEnabled();
    await user.click(uploadButton);

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        alt: 'حلقة مستقبل العمل',
        caption: undefined,
        width: 1600,
        height: 900,
      }),
    );
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:poster');
  });

  it('explains a missing media storage configuration without exposing the API error', async () => {
    render(
      <ArticleMediaDialog
        value={{ kind: 'image' }}
        assets={[]}
        disabled={false}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => {
          throw new AdminRepositoryError({
            code: 'REMOTE_UNAVAILABLE',
            operation: 'listArticleMedia',
            message: 'Media storage unavailable.',
            retryable: false,
            context: { remoteCode: 'MEDIA_STORAGE_NOT_CONFIGURED' },
          });
        })}
        onUpload={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('تخزين الصور غير مهيأ في الخادم.');
  });

  it('keeps the file chooser focusable for keyboard users', () => {
    render(
      <ArticleMediaDialog
        value={{ kind: 'image' }}
        assets={[]}
        disabled={false}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    const fileInput = screen.getByLabelText('اختيار صورة من الجهاز');
    fileInput.focus();

    expect(fileInput).toHaveFocus();
    expect(fileInput).toHaveClass('article-media-dialog__file-input');
  });

  it('keeps image upload inactive until the file and alternative text are ready', async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:image'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    class LoadedImage extends EventTarget {
      naturalWidth = 1200;
      naturalHeight = 800;
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      }
    }
    vi.stubGlobal('Image', LoadedImage);
    const uploaded: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000002',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'article.png',
      byteSize: 5,
      width: 1200,
      height: 800,
      defaultAlt: 'صورة توضيحية للمقال',
      status: 'ready',
      publicUrl: 'data:image/png;base64,AAAA',
      createdAt: '2026-08-18T12:00:00.000Z',
    };
    const upload = vi.fn(async () => uploaded);

    render(
      <ArticleMediaDialog
        value={{ kind: 'image' }}
        assets={[]}
        disabled={false}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={upload}
        onCommit={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText('اختيار صورة من الجهاز'),
      new File(['image'], 'article.png', { type: 'image/png' }),
    );
    const uploadButton = await screen.findByRole('button', { name: 'رفع الصورة' });
    const fileInput = screen.getByLabelText('اختيار صورة من الجهاز');
    const alternativeTextInput = screen.getByRole('textbox', { name: /^الوصف البديل/ });
    expect(uploadButton).toBeDisabled();
    expect(uploadButton).toHaveClass('button--primary');
    expect(
      fileInput.compareDocumentPosition(alternativeTextInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      alternativeTextInput.compareDocumentPosition(uploadButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await user.type(alternativeTextInput, 'صورة توضيحية للمقال');
    expect(uploadButton).toBeEnabled();
    expect(upload).not.toHaveBeenCalled();

    await user.click(uploadButton);
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({ alt: 'صورة توضيحية للمقال', caption: undefined }),
      ),
    );
  });

  it('offers only safe image design values and explains wide-image alignment', async () => {
    const user = userEvent.setup();
    render(
      <ArticleMediaDialog
        value={{ kind: 'image' }}
        assets={[]}
        disabled={false}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    const presentation = screen.getByRole('combobox', { name: 'عرض الصورة' });
    const alignment = screen.getByRole('combobox', { name: /^محاذاة الصورة/ });
    const radius = screen.getByRole('combobox', { name: 'حواف الصورة' });

    expect(alignment).toHaveValue('center');
    expect(radius).toHaveValue('none');
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual([
      'content',
      'wide',
      'start',
      'center',
      'end',
      'none',
      'soft',
      'round',
    ]);

    await user.selectOptions(presentation, 'wide');
    expect(alignment).toBeDisabled();
    expect(screen.getByText('لا تتغير محاذاة الصورة عند اختيار العرض الواسع.')).toBeVisible();
  });

  it('accepts a safe optional image link and blocks executable URLs', async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    const asset: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000003',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'sponsor.png',
      byteSize: 5,
      width: 1200,
      height: 400,
      defaultAlt: 'إعلان الراعي',
      status: 'ready',
      publicUrl: 'data:image/png;base64,AAAA',
      createdAt: '2026-08-18T12:00:00.000Z',
    };
    render(
      <ArticleMediaDialog
        value={{ kind: 'image' }}
        assets={[asset]}
        disabled={false}
        onClose={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
        onUpload={vi.fn()}
        onCommit={commit}
      />,
    );

    await user.click(screen.getByRole('option', { name: /sponsor\.png/ }));
    const link = screen.getByRole('textbox', { name: /^رابط الصورة \(اختياري\)/ });
    await user.type(link, 'javascript:alert(1)');
    expect(screen.getByRole('alert')).toHaveTextContent('استخدم رابطًا يبدأ بـ https:// أو /');
    expect(screen.getByRole('button', { name: 'إدراج الصورة' })).toBeDisabled();

    await user.clear(link);
    await user.type(link, '/sponsor');
    await user.click(screen.getByRole('button', { name: 'إدراج الصورة' }));
    expect(commit).toHaveBeenCalledWith(
      'image',
      expect.objectContaining({
        mediaId: asset.id,
        alt: 'إعلان الراعي',
        linkUrl: '/sponsor',
      }),
    );
  });
});
