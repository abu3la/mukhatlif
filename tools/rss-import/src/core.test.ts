import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRssImportManifest,
  deterministicEpisodeId,
  htmlToPlainText,
  parseRssSnapshot,
} from './core.ts';
import { parseArguments } from './cli.ts';
import { mergeImportedRow } from './import-plan.ts';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[برنامج تجريبي]]></title>
    <description><![CDATA[<p>وصف <strong>آمن</strong><br>بسطرين<script>alert(1)</script></p>]]></description>
    <link>https://example.com/show</link>
    <language>ar</language>
    <atom:link href="https://example.com/rss" rel="self" type="application/rss+xml"/>
    <itunes:image href="https://example.com/show.jpg"/>
    <item>
      <title><![CDATA[حلقة &amp; اختبار]]></title>
      <description><![CDATA[<p>السطر الأول<br/>السطر الثاني&nbsp;</p>]]></description>
      <link>https://example.com/episodes/1</link>
      <guid isPermaLink="false">stable-guid-1</guid>
      <pubDate>Tue, 01 Sep 2026 13:43:11 GMT</pubDate>
      <enclosure url="https://cdn.example.com/1.mp3" length="123" type="audio/mpeg"/>
      <itunes:duration>01:02:03</itunes:duration>
      <itunes:episodeType>bonus</itunes:episodeType>
    </item>
  </channel>
</rss>`;

function rssFixture(showNumber: number, episodeCount: number): string {
  const slug = `show-${String(showNumber).padStart(2, '0')}`;
  const episodes = Array.from({ length: episodeCount }, (_, index) => {
    const episodeNumber = index + 1;
    return `
    <item>
      <title>حلقة ${episodeNumber}</title>
      <description>وصف الحلقة ${episodeNumber}</description>
      <link>https://example.com/${slug}/episodes/${episodeNumber}</link>
      <guid isPermaLink="false">${slug}-episode-${episodeNumber}</guid>
      <pubDate>${new Date(Date.UTC(2026, 0, episodeNumber)).toUTCString()}</pubDate>
      <enclosure url="https://cdn.example.com/${slug}/${episodeNumber}.mp3" length="123" type="audio/mpeg"/>
      <itunes:duration>00:01:00</itunes:duration>
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>برنامج ${showNumber}</title>
    <description>وصف البرنامج ${showNumber}</description>
    <link>https://example.com/${slug}</link>
    <atom:link href="https://example.com/rss/${slug}.xml" rel="self" type="application/rss+xml"/>${episodes}
  </channel>
</rss>`;
}

describe('RSS snapshot parser', () => {
  it('sanitizes notes and preserves channel, enclosure, and episode metadata', () => {
    const show = parseRssSnapshot({
      xml: SAMPLE_RSS,
      slug: 'sample',
      sourceFile: 'sample.xml',
      sourceChecksumSha256: 'a'.repeat(64),
    });
    expect(show.id).toBe('shw-sample');
    expect(show.rssUrl).toBe('https://example.com/rss');
    expect(show.description).toBe('وصف آمن\nبسطرين');
    expect(show.episodes).toHaveLength(1);
    expect(show.episodes[0]).toMatchObject({
      title: 'حلقة & اختبار',
      description: 'السطر الأول\nالسطر الثاني',
      durationSec: 3723,
      episodeType: 'bonus',
      artworkUrl: 'https://example.com/show.jpg',
      enclosure: {
        url: 'https://cdn.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        lengthBytes: 123,
      },
    });
  });

  it('makes IDs and repeated manifests deterministic', async () => {
    expect(deterministicEpisodeId('sample', 'stable-guid-1')).toBe(
      deterministicEpisodeId('sample', 'stable-guid-1'),
    );
    const directory = await mkdtemp(path.join(tmpdir(), 'mukhtalif-rss-'));
    await writeFile(path.join(directory, 'sample.xml'), SAMPLE_RSS);
    const first = await buildRssImportManifest({ rssDirectory: directory, snapshot: 'test' });
    const second = await buildRssImportManifest({ rssDirectory: directory, snapshot: 'test' });
    expect(second).toEqual(first);
    expect(first.shows[0].episodes[0].id).toMatch(/^ep-rss-sample-[0-9a-f]{16}$/);
  });

  it('parses 16 independent snapshots into 836 unique episodes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mukhtalif-rss-collection-'));
    try {
      await Promise.all(
        Array.from({ length: 16 }, (_, index) => {
          const showNumber = index + 1;
          const episodeCount = showNumber <= 4 ? 53 : 52;
          return writeFile(
            path.join(directory, `show-${String(showNumber).padStart(2, '0')}.xml`),
            rssFixture(showNumber, episodeCount),
          );
        }),
      );

      const manifest = await buildRssImportManifest({
        rssDirectory: directory,
        snapshot: 'test',
      });
      const episodes = manifest.shows.flatMap((show) => show.episodes);
      expect(manifest.shows).toHaveLength(16);
      expect(episodes).toHaveLength(836);
      expect(new Set(episodes.map((episode) => episode.id))).toHaveLength(836);
      expect(new Set(episodes.map((episode) => episode.guid))).toHaveLength(836);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('removes unsafe markup without flattening paragraphs', () => {
    expect(htmlToPlainText('<iframe>bad</iframe><p>نص&nbsp;واضح<br>سطر</p>')).toBe('نص واضح\nسطر');
  });
});

describe('idempotent merge', () => {
  it('preserves Studio edits and advances untouched imported fields', () => {
    const current = {
      id: 'ep-1',
      title_ar: 'عنوان من الاستديو',
      duration_sec: 60,
      status: 'draft',
    };
    const incoming = {
      id: 'ep-1',
      title_ar: 'عنوان RSS جديد',
      duration_sec: 90,
      status: 'published',
    };
    const previous = {
      title_ar: 'عنوان RSS قديم',
      duration_sec: 60,
      status: 'published',
    };
    const result = mergeImportedRow(current, incoming, previous, new Set(['status']));
    expect(result.row).toEqual({
      id: 'ep-1',
      title_ar: 'عنوان من الاستديو',
      duration_sec: 90,
      status: 'draft',
    });
    expect(result.changedFields).toEqual(['duration_sec']);
    expect(result.preservedFields).toEqual(['title_ar']);
  });
});

describe('CLI safety', () => {
  it('is a dry run unless apply is explicit and accepts pnpm argument separators', () => {
    expect(parseArguments(['--'])).toMatchObject({ apply: false, offline: false });
    expect(parseArguments(['--', '--offline'])).toMatchObject({ apply: false, offline: true });
    expect(parseArguments(['--apply'])).toMatchObject({ apply: true, offline: false });
    expect(() => parseArguments(['--apply', '--offline'])).toThrow(
      '--apply and --offline cannot be combined',
    );
  });
});
