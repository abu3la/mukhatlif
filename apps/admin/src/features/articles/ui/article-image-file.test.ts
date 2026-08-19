import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareArticleCoverImage, prepareArticleImage } from './article-image-file';

function stubImageDimensions(width: number, height: number) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:cover-test'),
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

function coverFile() {
  return new File(['cover'], 'cover.png', { type: 'image/png' });
}

describe('prepareArticleCoverImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['الحد الأدنى', 1_200, 675],
    ['المقاس الموصى به', 1_600, 900],
    ['صورة قريبة من النسبة', 1_600, 909],
    ['صورة عند هامش 1%', 1_212, 675],
    ['صورة بعد هامش 1%', 1_213, 675],
    ['صورة طولية قابلة للقص', 1_200, 1_600],
    ['صورة مربعة قابلة للقص', 1_200, 1_200],
    ['صورة أفقية قابلة للقص', 1_200, 800],
  ])('accepts %s at %s × %s', async (_label, width, height) => {
    stubImageDimensions(width, height);

    await expect(prepareArticleCoverImage(coverFile())).resolves.toMatchObject({
      width,
      height,
    });
  });

  it('rejects a cover below the minimum and reports its actual dimensions', async () => {
    stubImageDimensions(1_199, 675);

    await expect(prepareArticleCoverImage(coverFile())).rejects.toThrow(
      'أبعاد الصورة 1199 × 675 بكسل. الحد الأدنى للغلاف 1200 × 675 بكسل.',
    );
  });

  it('rejects a 1200 × 674 cover below the minimum height', async () => {
    stubImageDimensions(1_200, 674);

    await expect(prepareArticleCoverImage(coverFile())).rejects.toThrow(
      'أبعاد الصورة 1200 × 674 بكسل. الحد الأدنى للغلاف 1200 × 675 بكسل.',
    );
  });

  it('keeps portrait images valid for inline article media', async () => {
    stubImageDimensions(1_200, 1_600);

    await expect(prepareArticleImage(coverFile())).resolves.toMatchObject({
      width: 1_200,
      height: 1_600,
    });
  });
});
