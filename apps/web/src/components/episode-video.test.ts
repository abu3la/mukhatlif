import { describe, expect, it } from 'vitest';
import { isYouTubeVideoId, parseYouTubeVideoId, youtubeThumbnailUrl } from '@mukhtalif/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyEpisodeCard } from './weekly-episodes';
import { EpisodeVideo } from './episode-video';
import { PlayerProvider } from './player';

describe('episode video sources', () => {
  it('renders the iframe immediately without a reveal button, autoplay or external watch link', () => {
    const markup = renderToStaticMarkup(
      createElement(PlayerProvider, {
        children: createElement(EpisodeVideo, { videoId: 'LyxZez5Nixk', title: 'حلقة اختبارية' }),
      }),
    );
    expect(markup).toContain('<iframe');
    expect(markup).toContain('https://www.youtube-nocookie.com/embed/LyxZez5Nixk');
    expect(markup).toContain('مشاهدة الحلقة</h2>');
    expect(markup).not.toContain('autoplay=1');
    expect(markup).not.toContain('فتح في YouTube');
    expect(markup).not.toContain('youtube.com/watch');
    expect(markup).not.toContain('aria-expanded');
  });
  it('renders no video section for absent or invalid IDs', () => {
    for (const videoId of [undefined, null, '<script>bad</script>']) {
      expect(renderToStaticMarkup(createElement(EpisodeVideo, { videoId, title: 'حلقة' }))).toBe(
        '',
      );
    }
  });
  it('only accepts canonical YouTube video URLs and exact IDs', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=LyxZez5Nixk&t=4')).toBe(
      'LyxZez5Nixk',
    );
    expect(parseYouTubeVideoId('https://youtu.be/LyxZez5Nixk')).toBe('LyxZez5Nixk');
    for (const invalid of [
      'javascript:alert(1)',
      'https://youtube.com.evil.test/watch?v=LyxZez5Nixk',
      'https://password@youtube.com/watch?v=LyxZez5Nixk',
      'https://youtube.com/shorts/LyxZez5Nixk',
      'short',
    ]) {
      expect(parseYouTubeVideoId(invalid)).toBeNull();
    }
    expect(isYouTubeVideoId('../injected')).toBe(false);
    expect(youtubeThumbnailUrl('../injected')).toBeNull();
  });
  it('renders real thumbnails for public weekly cards, never premium video sources', () => {
    const episode = {
      id: 'ep-1',
      showId: 'show-1',
      showTitleAr: 'مناوب',
      titleAr: 'الحلقة',
      showNotesAr: '',
      durationSec: 100,
      episodeNumber: 1,
      premium: false,
      youtubeVideoId: 'LyxZez5Nixk',
    };
    const markup = renderToStaticMarkup(createElement(WeeklyEpisodeCard, { episode }));
    expect(markup).toContain('https://i.ytimg.com/vi/LyxZez5Nixk/hqdefault.jpg');
    expect(
      renderToStaticMarkup(
        createElement(WeeklyEpisodeCard, { episode: { ...episode, premium: true } }),
      ),
    ).not.toContain('i.ytimg.com');
  });
});
