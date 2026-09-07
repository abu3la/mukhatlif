'use client';

import { useEffect, useId, useRef } from 'react';
import { isYouTubeVideoId } from '@mukhtalif/types';
import { usePlayer } from './player';
import { loadYouTubeApi, type YouTubePlayer } from './youtube-player-api';
import styles from './episode-video.module.css';

function VideoFrame({ videoId, initialSeconds = 0 }: { videoId: string; initialSeconds?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const { pause } = usePlayer();
  // Only the strictly validated ID enters this static HTML. YouTube owns this subtree.
  const start = Number.isFinite(initialSeconds) ? Math.max(0, Math.floor(initialSeconds)) : 0;
  const html = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&start=${start}" title="مشغل فيديو الحلقة" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let disposed = false;
    let player: YouTubePlayer | undefined;
    let playing = false;
    const reportTime = () => {
      const seconds = player?.getCurrentTime?.();
      if (Number.isFinite(seconds))
        window.dispatchEvent(
          new CustomEvent('mukhtalif:video-time', { detail: { videoId, seconds, playing } }),
        );
    };
    const stopVideo = () => {
      playing = false;
      if (player?.pauseVideo) player.pauseVideo();
      else {
        const frame = root.querySelector('iframe');
        if (frame) frame.setAttribute('src', frame.src);
      }
    };
    window.addEventListener('mukhtalif:audio-start', stopVideo);
    const seekChapter = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId: string; seconds: number }>).detail;
      if (detail?.videoId !== videoId || !Number.isFinite(detail.seconds) || detail.seconds < 0)
        return;
      pause();
      if (player?.seekTo) player.seekTo(detail.seconds, true);
      else {
        const frame = root.querySelector('iframe');
        if (frame) {
          const url = new URL(frame.src);
          url.searchParams.set('start', String(Math.floor(detail.seconds)));
          frame.src = url.toString();
        }
      }
      root.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    };
    window.addEventListener('mukhtalif:chapter-seek', seekChapter);
    const timeInterval = window.setInterval(() => {
      if (playing) reportTime();
    }, 1000);
    void loadYouTubeApi()
      .then((api) => {
        if (disposed) return;
        const frame = root.querySelector('iframe');
        if (!frame) return;
        const src = new URL(frame.src);
        src.searchParams.set('origin', window.location.origin);
        frame.src = src.toString();
        player = new api.Player(frame, {
          events: {
            onStateChange: (event) => {
              if (disposed) return;
              playing = event.data === 1;
              if (playing) pause();
              reportTime();
            },
          },
        });
      })
      .catch(() => {
        // Script blockers must not remove the directly embedded video.
      });
    return () => {
      disposed = true;
      window.removeEventListener('mukhtalif:audio-start', stopVideo);
      window.removeEventListener('mukhtalif:chapter-seek', seekChapter);
      window.clearInterval(timeInterval);
      player?.destroy();
      // Restore the seed for React Strict Mode's setup/cleanup/setup lifecycle.
      root.innerHTML = html;
    };
  }, [html, pause, videoId]);
  return (
    <div ref={container} className={styles.frame} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function EpisodeVideo({
  videoId,
  title,
  initialSeconds = 0,
}: {
  videoId?: string | null;
  title: string;
  initialSeconds?: number;
}) {
  const headingId = useId();
  if (!isYouTubeVideoId(videoId)) return null;
  return (
    <section id="episode-video" className={styles.video} aria-labelledby={headingId}>
      <h2 id={headingId} className="episode-notes__title">
        مشاهدة الحلقة
      </h2>
      <div aria-label={`فيديو: ${title}`}>
        <VideoFrame key={videoId} videoId={videoId} initialSeconds={initialSeconds} />
      </div>
    </section>
  );
}
