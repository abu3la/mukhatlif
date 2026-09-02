import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadWordPressMedia, parseRestMediaManifest } from './media.ts';
import type { WordPressManifest } from './types.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function mediaManifest(): WordPressManifest {
  return {
    schemaVersion: 1,
    source: {
      kind: 'wordpress_wxr',
      siteUrl: 'https://mukhtalif.net',
      blogUrl: 'https://mukhtalif.net',
      title: 'مختلف',
      description: '',
      language: 'ar',
      wxrVersion: '1.2',
      generator: null,
      exportedAt: null,
      sourceFile: '/backup.xml',
      sourceChecksumSha256: 'a'.repeat(64),
    },
    authors: [],
    candidates: {
      post: [],
      page: [],
      team_member: [],
      book: [],
      attachment: [
        {
          legacyId: 42,
          postType: 'attachment',
          status: 'inherit',
          title: 'صورة',
          slug: 'image',
          suggestedTargetSlug: 'image',
          legacyUrl: null,
          guid: null,
          authorLogin: null,
          publishedAt: null,
          createdAt: null,
          updatedAt: null,
          parentLegacyId: null,
          menuOrder: 0,
          contentHtml: '',
          excerptHtml: '',
          featuredMediaLegacyId: null,
          terms: [],
          oldSlugs: [],
          seo: {
            title: null,
            description: null,
            canonicalUrl: null,
            noIndex: false,
            focusKeyword: null,
            primaryCategoryLegacyId: null,
            openGraph: { title: null, description: null, imageUrl: null, imageLegacyId: null },
            twitter: { title: null, description: null, imageUrl: null, imageLegacyId: null },
          },
          builder: null,
          media: {
            source: 'wxr',
            sourceUrl: 'https://cdn.example/%2E%2E%2Fcover.jpg',
            attachedFile: null,
            mimeType: 'image/jpeg',
            altText: null,
            captionHtml: null,
            width: null,
            height: null,
            byteSize: null,
          },
          teamMember: null,
          book: null,
          checksumSha256: 'b'.repeat(64),
        },
      ],
    },
    deferred: [],
    ignored: { byPostType: {}, total: 0 },
    proposedRedirects: [],
    checksumSha256: 'c'.repeat(64),
  };
}

describe('REST media and offline downloader', () => {
  it('validates the REST shape and preserves original metadata', () => {
    expect(
      parseRestMediaManifest([
        {
          id: 42,
          source_url: 'https://cdn.example/cover.jpg',
          mime_type: 'image/jpeg',
          alt_text: 'غلاف',
          caption: { rendered: '<p>تعليق</p>' },
          media_details: { width: 100, height: 50, filesize: 200, file: '2026/cover.jpg' },
        },
      ]),
    ).toEqual([
      {
        id: 42,
        sourceUrl: 'https://cdn.example/cover.jpg',
        mimeType: 'image/jpeg',
        altText: 'غلاف',
        captionHtml: '<p>تعليق</p>',
        width: 100,
        height: 50,
        byteSize: 200,
        originalPath: '2026/cover.jpg',
      },
    ]);
  });

  it('downloads to a legacy-ID directory, records checksum, and reuses a verified file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'mukhtalif-media-'));
    temporaryDirectories.push(directory);
    const fetcher = async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '3' },
      });
    const first = await downloadWordPressMedia({
      manifest: mediaManifest(),
      outputDirectory: directory,
      fetcher: fetcher as typeof fetch,
    });
    expect(first.downloaded).toBe(1);
    expect(first.failed).toBe(0);
    expect(first.results[0].relativePath).toMatch(/^media\/originals\/42\//);
    expect([...(await readFile(path.join(directory, first.results[0].relativePath!)))]).toEqual([
      1, 2, 3,
    ]);

    const second = await downloadWordPressMedia({
      manifest: mediaManifest(),
      outputDirectory: directory,
      previousReport: first,
      fetcher: (() => {
        throw new Error('verified media should not be fetched again');
      }) as typeof fetch,
    });
    expect(second.reused).toBe(1);
    expect(second.downloaded).toBe(0);
  });
});
