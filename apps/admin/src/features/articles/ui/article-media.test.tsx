import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArticleMediaAsset } from '@/data';
import { ArticleContentPreview, parseArticleVideoUrl } from './article-media';

afterEach(cleanup);

describe('parseArticleVideoUrl', () => {
  it('normalizes supported YouTube and Vimeo URLs', () => {
    expect(parseArticleVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
    expect(parseArticleVideoUrl('vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      videoId: '123456789',
      canonicalUrl: 'https://vimeo.com/123456789',
      embedUrl: 'https://player.vimeo.com/video/123456789',
    });
  });

  it('rejects unsupported, insecure, credentialed, and malformed URLs', () => {
    expect(parseArticleVideoUrl('https://example.com/video')).toBeNull();
    expect(parseArticleVideoUrl('http://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(parseArticleVideoUrl('https://user:secret@vimeo.com/123456789')).toBeNull();
    expect(parseArticleVideoUrl('https://youtube.com/watch?v=short')).toBeNull();
  });
});

describe('ArticleContentPreview image design', () => {
  it('applies only the canonical alignment and radius classes', () => {
    const asset: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000001',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'studio.png',
      byteSize: 4000,
      width: 1200,
      height: 800,
      defaultAlt: 'واجهة الاستوديو',
      status: 'ready',
      publicUrl: 'data:image/png;base64,AAAA',
      createdAt: '2026-08-17T12:00:00.000Z',
    };

    render(
      <ArticleContentPreview
        document={{
          type: 'doc',
          content: [
            {
              type: 'imageBlock',
              attrs: {
                mediaId: asset.id,
                alt: 'واجهة محرر مختلف',
                presentation: 'content',
                alignment: 'start',
                radius: 'soft',
              },
            },
          ],
        }}
        assets={[asset]}
        channel="web"
      />,
    );

    expect(screen.getByAltText('واجهة محرر مختلف').closest('figure')).toHaveClass(
      'article-content-media--align-start',
      'article-content-media--radius-soft',
    );
  });

  it('previews a safe linked image with protected external navigation', () => {
    const asset: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000002',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'sponsor.png',
      byteSize: 4000,
      width: 1200,
      height: 400,
      defaultAlt: 'إعلان الراعي',
      status: 'ready',
      publicUrl: 'data:image/png;base64,AAAA',
      createdAt: '2026-08-17T12:00:00.000Z',
    };

    render(
      <ArticleContentPreview
        document={{
          type: 'doc',
          content: [
            {
              type: 'imageBlock',
              attrs: {
                mediaId: asset.id,
                alt: 'إعلان الراعي',
                presentation: 'wide',
                linkUrl: 'https://sponsor.example/campaign',
              },
            },
          ],
        }}
        assets={[asset]}
        channel="web"
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://sponsor.example/campaign');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toContainElement(screen.getByAltText('إعلان الراعي'));
  });
});

describe('ArticleContentPreview ad placements', () => {
  const document = {
    type: 'doc',
    content: [
      {
        type: 'adBlock',
        attrs: { placementId: 'article-middle-1', format: 'inline', label: 'منتصف المقال' },
      },
    ],
  };

  it('shows the placement on web and omits it from the email preview', () => {
    const web = render(<ArticleContentPreview document={document} assets={[]} channel="web" />);
    expect(screen.getByRole('complementary', { name: 'مساحة إعلانية' })).toHaveAttribute(
      'data-ad-placement',
      'article-middle-1',
    );
    web.unmount();

    const email = render(<ArticleContentPreview document={document} assets={[]} channel="email" />);
    expect(email.container).toBeEmptyDOMElement();
  });
});

describe('ArticleContentPreview text sections', () => {
  it('renders canonical direction, height, and alignment metadata', () => {
    const { container } = render(
      <ArticleContentPreview
        document={{
          type: 'doc',
          content: [
            {
              type: 'textSection',
              attrs: {
                alignment: 'justify',
                direction: 'ltr',
                height: 'short',
                vertical: 'middle',
              },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'A weekly editorial note.' }],
                },
              ],
            },
          ],
        }}
        assets={[]}
        channel="web"
      />,
    );

    const section = container.querySelector('section[data-article-text-section]');
    expect(section).toHaveAttribute('dir', 'ltr');
    expect(section).toHaveAttribute('data-alignment', 'justify');
    expect(section).toHaveClass(
      'article-text-section--align-justify',
      'article-text-section--height-short',
      'article-text-section--vertical-middle',
    );
    expect(screen.getByText('A weekly editorial note.')).toBeInTheDocument();
  });
});
