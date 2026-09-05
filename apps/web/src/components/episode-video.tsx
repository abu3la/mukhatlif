'use client';

import { useEffect, useId, useRef } from 'react';
import { isYouTubeVideoId } from '@mukhtalif/types';
import { usePlayer } from './player';
import { loadYouTubeApi, type YouTubePlayer } from './youtube-player-api';
import styles from './episode-video.module.css';

function VideoFrame({ videoId }: { videoId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { pause } = usePlayer();
  // Only the strictly validated ID enters this static HTML. YouTube owns this subtree.
  const html = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0" title="مشغل فيديو الحلقة" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let disposed = false;
    let player: YouTubePlayer | undefined;
    const stopVideo = () => {
      if (player?.pauseVideo) player.pauseVideo();
      else {
        const frame = root.querySelector('iframe');
        if (frame) frame.setAttribute('src', frame.src);
      }
    };
    window.addEventListener('mukhtalif:audio-start', stopVideo);
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
              if (!disposed && event.data === 1) pause();
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
      player?.destroy();
      // Restore the seed for React Strict Mode's setup/cleanup/setup lifecycle.
      root.innerHTML = html;
    };
  }, [html, pause]);
  return (
    <div ref={container} className={styles.frame} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export function EpisodeVideo({ videoId, title }: { videoId?: string | null; title: string }) {
  const headingId = useId();
  if (!isYouTubeVideoId(videoId)) return null;
  return (
    <section className={styles.video} aria-labelledby={headingId}>
      <h2 id={headingId} className="episode-notes__title">
        مشاهدة الحلقة
      </h2>
      <div aria-label={`فيديو: ${title}`}>
        <VideoFrame key={videoId} videoId={videoId} />
      </div>
    </section>
  );
}
