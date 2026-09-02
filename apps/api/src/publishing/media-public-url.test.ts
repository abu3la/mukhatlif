import { describe, expect, it } from 'vitest';
import type { Article } from '@mukhtalif/types';
import {
  preserveStoredMediaUrl,
  rebaseArticleMediaUrls,
  rebaseTrustedMediaUrl,
} from './media-public-url';

const mediaId = `med-${'a'.repeat(32)}`;
const developmentOrigin = 'https://mukhtalif-api.mukhtalif-development.workers.dev';
const productionOrigin = 'https://api.mukhtalif.net';

describe('trusted persisted media URLs', () => {
  it('rebases an exact imported media path onto the current runtime origin', () => {
    expect(rebaseTrustedMediaUrl(`${developmentOrigin}/media/${mediaId}`, productionOrigin)).toBe(
      `${productionOrigin}/media/${mediaId}`,
    );
    expect(rebaseTrustedMediaUrl(`${productionOrigin}/media/${mediaId}`, productionOrigin)).toBe(
      `${productionOrigin}/media/${mediaId}`,
    );
  });

  it('does not claim arbitrary, malformed, or decorated URLs as first-party media', () => {
    for (const value of [
      `https://attacker.example/media/${mediaId}`,
      `https://untrusted.workers.dev/media/${mediaId}`,
      `${developmentOrigin}/other/${mediaId}`,
      `${developmentOrigin}/media/not-an-asset-id`,
      `${developmentOrigin}/media/${mediaId}?download=1`,
      `${developmentOrigin}/media/${mediaId}#fragment`,
    ]) {
      expect(rebaseTrustedMediaUrl(value, productionOrigin)).toBe(value);
    }
  });

  it('clones only the article media fields and leaves the stored object untouched', () => {
    const article = {
      coverUrl: `${developmentOrigin}/media/${mediaId}`,
      seo: {
        canonicalUrl: 'https://mukhtalif.net/articles/example',
        socialImageUrl: `${developmentOrigin}/media/${mediaId}`,
        noIndex: false,
      },
    } as Article;

    const output = rebaseArticleMediaUrls(article, productionOrigin);

    expect(output.coverUrl).toBe(`${productionOrigin}/media/${mediaId}`);
    expect(output.seo.socialImageUrl).toBe(`${productionOrigin}/media/${mediaId}`);
    expect(output.seo.canonicalUrl).toBe(article.seo.canonicalUrl);
    expect(article.coverUrl).toBe(`${developmentOrigin}/media/${mediaId}`);
    expect(article.seo.socialImageUrl).toBe(`${developmentOrigin}/media/${mediaId}`);
  });

  it('preserves the stored origin when Studio sends back the same projected media asset', () => {
    const stored = `${developmentOrigin}/media/${mediaId}`;
    const projected = `${productionOrigin}/media/${mediaId}`;

    expect(preserveStoredMediaUrl(projected, stored, productionOrigin)).toBe(stored);
    expect(
      preserveStoredMediaUrl(
        `${productionOrigin}/media/med-${'b'.repeat(32)}`,
        stored,
        productionOrigin,
      ),
    ).not.toBe(stored);
    expect(
      preserveStoredMediaUrl('https://attacker.example/media/' + mediaId, stored, productionOrigin),
    ).toBe('https://attacker.example/media/' + mediaId);
  });
});
