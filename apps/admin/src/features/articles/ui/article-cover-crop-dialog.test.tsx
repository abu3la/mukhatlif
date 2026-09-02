import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PixelCrop } from 'react-image-crop';
import {
  ArticleCoverCropDialog,
  articleCoverCropGeometry,
  cropArticleCoverFile,
  initialArticleCoverCrop,
} from './article-cover-crop-dialog';
import type { PreparedArticleImage } from './article-image-file';

const PORTRAIT_PIXEL_CROP: PixelCrop = {
  unit: 'px',
  x: 0,
  y: 231.25,
  width: 600,
  height: 337.5,
};

function preparedSource(width = 1_200, height = 1_600): PreparedArticleImage {
  return {
    file: new File(['original-cover'], 'portrait.png', { type: 'image/png' }),
    width,
    height,
  };
}

function loadCropImage(width = 1_200, height = 1_600) {
  const image = screen.getByAltText('الصورة الأصلية لتحديد قص الغلاف');
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
    width: { configurable: true, value: 600 },
    height: { configurable: true, value: (height / width) * 600 },
  });
  fireEvent.load(image);
  return image;
}

function stubCanvas(blob = new Blob(['cropped-cover'], { type: 'image/png' })) {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: vi.fn((callback: BlobCallback) => callback(blob)),
  });
  return drawImage;
}

describe('article cover crop geometry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('centers a fixed 16:9 crop in portrait and landscape sources', () => {
    const portrait = initialArticleCoverCrop(1_200, 1_600);
    const landscape = initialArticleCoverCrop(1_600, 900);

    expect(portrait.unit).toBe('%');
    expect(portrait.width).toBeCloseTo(100);
    expect(portrait.height).toBeCloseTo(42.1875);
    expect(portrait.x).toBeCloseTo(0);
    expect(portrait.y).toBeCloseTo(28.90625);
    expect(landscape).toMatchObject({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
  });

  it('maps the rendered crop to natural pixels without upscaling', () => {
    expect(
      articleCoverCropGeometry(
        PORTRAIT_PIXEL_CROP,
        600,
        800,
        1_200,
        1_600,
      ),
    ).toEqual({ sourceX: 0, sourceY: 462.5, width: 1_200, height: 675 });
  });

  it('exports a new file at natural crop dimensions and ignores device pixel ratio', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const drawImage = stubCanvas();
    const source = preparedSource();
    const image = {
      width: 600,
      height: 800,
      naturalWidth: 1_200,
      naturalHeight: 1_600,
    } as HTMLImageElement;

    const result = await cropArticleCoverFile(source, image, PORTRAIT_PIXEL_CROP);

    expect(result.file).not.toBe(source.file);
    expect(result.file.name).toBe('portrait-cover.png');
    expect(result).toMatchObject({ width: 1_200, height: 675 });
    expect(drawImage).toHaveBeenCalledWith(
      image,
      0,
      462.5,
      1_200,
      675,
      0,
      0,
      1_200,
      675,
    );
  });
});

describe('ArticleCoverCropDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('provides Arabic labels for the crop area and every physical resize handle', async () => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:portrait-cover'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    render(
      <ArticleCoverCropDialog source={preparedSource()} onCancel={vi.fn()} onApply={vi.fn()} />,
    );
    loadCropImage();

    expect(await screen.findByRole('dialog', { name: 'قص صورة الغلاف' })).toBeVisible();
    expect(
      screen.getByLabelText('استخدم أسهم لوحة المفاتيح لتحريك مساحة قص الغلاف'),
    ).toBeVisible();
    for (const label of [
      'استخدم الأسهم لتغيير القص من الزاوية العلوية اليسرى',
      'استخدم السهمين لأعلى وأسفل لتغيير الحد العلوي للقص',
      'استخدم الأسهم لتغيير القص من الزاوية العلوية اليمنى',
      'استخدم السهمين لليمين واليسار لتغيير الحد الأيمن للقص',
      'استخدم الأسهم لتغيير القص من الزاوية السفلية اليمنى',
      'استخدم السهمين لأعلى وأسفل لتغيير الحد السفلي للقص',
      'استخدم الأسهم لتغيير القص من الزاوية السفلية اليسرى',
      'استخدم السهمين لليمين واليسار لتغيير الحد الأيسر للقص',
    ]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    expect(screen.getByText('أبعاد الغلاف الناتج: 1200 × 675 بكسل.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByRole('button', { name: 'اعتماد القص' })).toBeEnabled();
  });

  it('applies the cropped file and handles a real Escape key event', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:portrait-cover'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    stubCanvas();
    render(
      <ArticleCoverCropDialog
        source={preparedSource()}
        onCancel={onCancel}
        onApply={onApply}
      />,
    );
    loadCropImage();

    await user.click(screen.getByRole('button', { name: 'اعتماد القص' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ width: 1_200, height: 675 });

    const dialog = screen.getByRole('dialog', { name: 'قص صورة الغلاف' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
