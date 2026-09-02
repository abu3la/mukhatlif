import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const article = {
  slug: 'legacy-article',
  titleAr: 'عنوان المقال',
  excerptAr: 'ملخص قصير',
  coverUrl: 'https://media.example.com/media/med-123',
  coverAlt: 'وصف غلاف المقال',
  publishedAt: '2026-09-02T12:00:00.000Z',
  author: { displayName: 'فريق مختلف' },
};

afterEach(() => vi.unstubAllGlobals());

describe('ArticleCard', () => {
  it('renders the imported cover, title, and one clickable article destination', async () => {
    vi.stubGlobal('React', React);
    const { ArticleCard } = await import('./cards');
    const html = renderToStaticMarkup(
      React.createElement(ArticleCard, { article, headingLevel: 2 }),
    );

    expect(html).toContain('href="/articles/legacy-article"');
    expect(html).toContain('src="https://media.example.com/media/med-123"');
    expect(html).toContain('alt="وصف غلاف المقال"');
    expect(html).toContain('<h2 class="card__title article-card__title">عنوان المقال</h2>');
  });
});
