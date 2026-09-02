import { describe, expect, it } from 'vitest';
import { parsePodcastRss, podcastDurationSeconds } from './rss.ts';

describe('podcast RSS parser', () => {
  it('normalizes feed and enclosure metadata without inventing playback values', () => {
    const xml = `<rss xmlns:itunes="x" xmlns:content="x"><channel>
      <title>بترولي</title><description><![CDATA[وصف البرنامج]]></description><language>ar</language>
      <itunes:author>مختلف</itunes:author><itunes:image href="https://cdn.example/show.jpg" />
      <item><title>حلقة أولى</title><guid isPermaLink="false">episode-guid</guid>
        <link>https://mukhtalif.net/episode/1</link><pubDate>Wed, 02 Sep 2026 10:00:00 +0000</pubDate>
        <description><![CDATA[<p>الوصف</p>]]></description><content:encoded><![CDATA[<p>التفاصيل</p>]]></content:encoded>
        <enclosure url="https://cdn.example/episode.mp3" type="audio/mpeg" length="1234" />
        <itunes:duration>01:02:03</itunes:duration><itunes:episode>7</itunes:episode>
        <itunes:season>2</itunes:season><itunes:episodeType>full</itunes:episodeType>
        <itunes:image href="https://cdn.example/episode.jpg"/><itunes:explicit>false</itunes:explicit>
      </item>
    </channel></rss>`;
    const feed = parsePodcastRss(xml, { showSlug: 'petroly', source: '/backup/petroly.xml' });
    expect(feed.episodes).toHaveLength(1);
    expect(feed.episodes[0]).toMatchObject({
      legacyGuid: 'episode-guid',
      enclosureUrl: 'https://cdn.example/episode.mp3',
      enclosureMimeType: 'audio/mpeg',
      enclosureByteSize: 1234,
      durationSeconds: 3723,
      episodeNumber: 7,
      seasonNumber: 2,
      imageUrl: 'https://cdn.example/episode.jpg',
    });
  });

  it('parses supported duration forms and rejects malformed durations', () => {
    expect(podcastDurationSeconds('90')).toBe(90);
    expect(podcastDurationSeconds('12:34')).toBe(754);
    expect(podcastDurationSeconds('1:02:03')).toBe(3723);
    expect(podcastDurationSeconds('1:99')).toBeNull();
    expect(podcastDurationSeconds('unknown')).toBeNull();
  });
});
