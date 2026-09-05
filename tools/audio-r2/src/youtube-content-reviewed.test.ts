import { describe, expect, it } from 'vitest';
import { contentReviewedMatch } from './youtube-content-reviewed.ts';
import { videoLinkState } from './youtube-apply.ts';

function fixture() {
  const quotes = [
    'نناقش اليوم تجربة البرنامج مع ثلاثة ضيوف من تخصصات مختلفة',
    'نتحدث لاحقا عن رحلة التعلم وصناعة المحتوى المهني المفيد للجمهور',
  ];
  const file = { path: '/private/test.json', sha256: 'a'.repeat(64) };
  const episode = {
    id: 'ep-content-review',
    guid: 'guid-content',
    title: 'عنوان تغير في المنصة',
    durationSec: 4000,
    publishedAt: '2026-08-31T12:00:00Z',
    episodeType: 'full',
    enclosure: { url: 'https://example.org/approved-source.mp3' },
  };
  const show = { id: 'show-test', slug: 'petroly', title: 'بترولي', episodes: [episode] };
  const video = {
    id: '_u-D9M0rQUo',
    title: 'عنوان آخر لنفس الحلقة',
    duration: 4000,
    channel_id: 'UC8vdjzu_0QMQlG9qNT5D_AQ',
    availability: 'public',
    upload_date: '20260831',
  };
  const review = {
    kind: 'manually-reviewed-spoken-content' as const,
    sourceHashes: [file.sha256, file.sha256] as [string, string],
    audioReport: file,
    episodeId: episode.id,
    videoId: video.id,
    rationale:
      'The reviewer compared two distant portions of the same spoken conversation, identified their particular context, and checked the publisher, date and complete duration.',
    captions: { ...file, videoId: video.id },
    clips: quotes.map((sharedQuote) => ({ ...file, sharedQuote })),
  };
  const clips = [90, 1080].map((requestedStartSec, i) => ({
    episodeId: episode.id,
    reportSha256: file.sha256,
    originalSourceUrl: episode.enclosure.url,
    requestedStartSec,
    requestedDurationSec: 90,
    transcription: { audioSeconds: 90, text: quotes[i]!, pcmSha256: 'b'.repeat(64) },
  }));
  const captions = {
    events: clips.map((c, i) => ({
      tStartMs: c.requestedStartSec * 1000,
      segs: [{ utf8: quotes[i]! }],
    })),
  };
  return { review, show, episode, video, clips, captions };
}
const run = (f: ReturnType<typeof fixture>) =>
  contentReviewedMatch(f.review, f.show, f.episode, f.video, f.clips, f.captions);

describe('recorded spoken-content review', () => {
  it('preserves an edited source URL even when the title and duration match', () => {
    const f = fixture();
    const match = run(f);
    const row = {
      id: f.episode.id,
      show_id: f.show.id,
      rss_guid: f.episode.guid,
      title_ar: f.episode.title,
      duration_sec: f.episode.durationSec,
      premium: false,
      youtube_video_id: null,
      audio_url: f.episode.enclosure.url,
      source_url: f.episode.enclosure.url,
    };
    expect(videoLinkState(row, match)).toBe('link');
    expect(videoLinkState({ ...row, audio_url: 'https://example.org/edited.mp3' }, match)).toBe(
      'conflict',
    );
    expect(videoLinkState({ ...row, source_url: null }, match)).toBe('conflict');
  });
  it('accepts two distinct distant passages plus exact full duration and date', () => {
    expect(run(fixture()).status).toBe('manually-reviewed-two-spoken-passages');
  });
  it('does not relax the full-duration, publisher, date or trailer gates', () => {
    for (const patch of [
      { duration: 4003 },
      { duration: NaN },
      { availability: 'private' },
      { upload_date: '20250101' },
      { upload_date: 'invalid' },
      { channel_id: 'unknown' },
      { live_status: 'is_upcoming' },
      { id: 'bad' },
    ]) {
      const f = fixture();
      Object.assign(f.video, patch);
      expect(() => run(f)).toThrow();
    }
    for (const patch of [{ episodeType: 'trailer' }, { durationSec: 44 }]) {
      const f = fixture();
      Object.assign(f.episode, patch);
      expect(() => run(f)).toThrow();
    }
  });
  it('rejects wrong-source, unbound, incomplete or adjacent clips', () => {
    for (const patch of [
      { episodeId: 'another' },
      { originalSourceUrl: 'https://example.org/other.mp3' },
      { reportSha256: 'c'.repeat(64) },
      { requestedDurationSec: 91 },
      { requestedStartSec: -1 },
      { requestedStartSec: NaN },
    ]) {
      const f = fixture();
      Object.assign(f.clips[0]!, patch);
      expect(() => run(f)).toThrow();
    }
    const f = fixture();
    f.clips[1]!.requestedStartSec = 180;
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.clips[0]!.transcription.audioSeconds = 10;
    expect(() => run(g)).toThrow();
  });
  it('requires real unique words in both timed sources, not a claimed rationale', () => {
    const f = fixture();
    f.review.clips[0]!.sharedQuote = 'تعليق لا يوجد في المصادر';
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.captions.events.push({ ...g.captions.events[0]!, tStartMs: 200000 });
    expect(() => run(g)).toThrow();
    const h = fixture();
    h.captions.events[0]!.tStartMs = 500000;
    expect(() => run(h)).toThrow();
    const j = fixture();
    j.clips[0]!.transcription.text = 'نص مختلف';
    expect(() => run(j)).toThrow();
    const k = fixture();
    k.review.captions.videoId = 'LyxZez5Nixk';
    expect(() => run(k)).toThrow();
  });
});
