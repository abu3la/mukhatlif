import { describe, expect, it } from 'vitest';
import { reviewedEditionMatch } from './youtube-edition-reviewed.ts';

function fixture() {
  const guest = 'أحمد الخطيب';
  const episode = {
    id: 'ep-edition',
    guid: 'guid-edition',
    title: `الحلقة مع ${guest}`,
    durationSec: 4000,
    publishedAt: '2026-08-31T12:00:00Z',
    episodeType: 'full',
    enclosure: { url: 'https://example.org/source.mp3' },
  };
  const show = { id: 'show-test', slug: 'petroly', title: 'بترولي', episodes: [episode] };
  const video = {
    id: '_u-D9M0rQUo',
    title: `الحلقة مع ${guest}`,
    duration: 3800,
    channel_id: 'UC8vdjzu_0QMQlG9qNT5D_AQ',
    availability: 'public',
    upload_date: '20260831',
  };
  const file = { path: '/private/test.json', sha256: 'a'.repeat(64) };
  const texts = [0, 100].map((offset) =>
    Array.from({ length: 60 }, (_, i) => `كلمة${i + offset}`).join(' '),
  );
  const review = {
    kind: 'manually-reviewed-recording-editions' as const,
    episodeId: episode.id,
    videoId: video.id,
    sourcePublishedAt: episode.publishedAt,
    videoUploadDate: video.upload_date,
    sourceDurationSec: episode.durationSec,
    videoDurationSec: video.duration,
    guest,
    rationale: 'Explicit reviewer evidence. '.repeat(8),
    editionDifference:
      'The reviewed public edition omits a documented section from the source recording. No audio source or metadata will be replaced.',
    sourceHashes: [file.sha256, file.sha256] as [string, string],
    audioReport: file,
    captions: { ...file, videoId: video.id },
    clips: [0, 2000].map((videoStartSec, i) => ({
      ...file,
      videoStartSec,
      videoDurationSec: 120,
      sourceExcerpt: texts[i]!,
      captionExcerpt: texts[i]!,
    })),
  };
  const transcripts = [0, 2100].map((requestedStartSec, i) => ({
    episodeId: episode.id,
    reportSha256: file.sha256,
    originalSourceUrl: episode.enclosure.url,
    requestedStartSec,
    requestedDurationSec: 90,
    transcription: { text: texts[i]!, audioSeconds: 90, pcmSha256: 'b'.repeat(64) },
  }));
  const captions = {
    events: review.clips.map((c, i) => ({
      tStartMs: c.videoStartSec * 1000,
      segs: [{ utf8: texts[i]! }],
    })),
  };
  return { review, show, episode, video, transcripts, captions };
}
const run = (f: ReturnType<typeof fixture>) =>
  reviewedEditionMatch(f.review, f.show, f.episode, f.video, f.transcripts, f.captions);

describe('manually reviewed cuts of one recording', () => {
  it('allows an explicitly evidenced edition without changing source fields', () => {
    const f = fixture();
    expect(run(f)).toMatchObject({
      expectedSourceUrl: f.episode.enclosure.url,
      rssDurationSec: 4000,
      videoId: f.video.id,
    });
    expect(f.episode.durationSec).toBe(4000);
  });
  it('rejects wrong guests, sources, dates, incomplete metadata and trailers', () => {
    for (const patch of [
      { title: 'ضيف آخر' },
      { availability: 'private' },
      { channel_id: 'unreviewed' },
      { upload_date: '20250101' },
      { upload_date: 'invalid' },
      { duration: NaN },
      { live_status: 'is_live' },
    ]) {
      const f = fixture();
      Object.assign(f.video, patch);
      expect(() => run(f)).toThrow();
    }
    const f = fixture();
    f.episode.episodeType = 'trailer';
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.review.guest = 'طارق الحبيب';
    expect(() => run(g)).toThrow();
  });
  it('does not accept a single introduction or nearby repeated clips', () => {
    const f = fixture();
    f.review.clips.pop();
    f.transcripts.pop();
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.transcripts[1]!.requestedStartSec = 200;
    expect(() => run(g)).toThrow();
    const h = fixture();
    h.review.clips[1]!.videoStartSec = 200;
    expect(() => run(h)).toThrow();
    const j = fixture();
    j.transcripts[0]!.requestedStartSec = 900;
    expect(() => run(j)).toThrow();
  });
  it('rejects changed source evidence and unobserved caption text', () => {
    const f = fixture();
    f.transcripts[0]!.originalSourceUrl = 'https://example.org/edited.mp3';
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.transcripts[0]!.reportSha256 = 'c'.repeat(64);
    expect(() => run(g)).toThrow();
    const h = fixture();
    h.captions.events[0]!.segs[0]!.utf8 = 'نص آخر';
    expect(() => run(h)).toThrow();
    const j = fixture();
    j.review.clips[0]!.sourceExcerpt = 'عبارة قصيرة';
    expect(() => run(j)).toThrow();
    const k = fixture();
    k.review.captions.videoId = 'LyxZez5Nixk';
    expect(() => run(k)).toThrow();
  });
  it('requires bounded full clips and a recorded explanation, not just similar words', () => {
    const f = fixture();
    f.transcripts[0]!.transcription.audioSeconds = 10;
    expect(() => run(f)).toThrow();
    const g = fixture();
    g.review.clips[1]!.videoStartSec = 3790;
    expect(() => run(g)).toThrow();
    const h = fixture();
    h.review.editionDifference = '';
    expect(() => run(h)).toThrow();
    const j = fixture();
    j.review.rationale = '';
    expect(() => run(j)).toThrow();
  });
});
