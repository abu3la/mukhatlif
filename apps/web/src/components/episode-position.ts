'use client';

import { useEffect, useState } from 'react';
import { usePlayer, type PlayerEpisode } from './player';

/** Keep chapter and moment actions on the medium the listener used most recently. */
export function useEpisodePosition(
  episode: PlayerEpisode | null,
  videoId?: string | null,
  initialSeconds = 0,
) {
  const player = usePlayer();
  const [videoTime, setVideoTime] = useState<number | null>(null);
  const [medium, setMedium] = useState<'audio' | 'video' | null>(null);
  useEffect(() => {
    const video = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId: string; seconds: number; playing: boolean }>)
        .detail;
      if (detail?.videoId !== videoId || !Number.isFinite(detail.seconds)) return;
      setVideoTime(Math.max(0, detail.seconds));
      if (detail.playing) setMedium('video');
    };
    const audio = () => setMedium('audio');
    window.addEventListener('mukhtalif:video-time', video);
    window.addEventListener('mukhtalif:audio-start', audio);
    return () => {
      window.removeEventListener('mukhtalif:video-time', video);
      window.removeEventListener('mukhtalif:audio-start', audio);
    };
  }, [videoId]);
  const audioIsCurrent = Boolean(episode && player.isCurrent(episode));
  const useVideo = medium === 'video' || (!audioIsCurrent && Boolean(videoId));
  const seconds = Math.floor(
    useVideo ? (videoTime ?? initialSeconds) : audioIsCurrent ? player.currentTime : initialSeconds,
  );
  function seek(position: number) {
    if (useVideo && videoId) {
      setVideoTime(position);
      setMedium('video');
      window.dispatchEvent(
        new CustomEvent('mukhtalif:chapter-seek', { detail: { videoId, seconds: position } }),
      );
    } else if (episode) {
      setMedium('audio');
      player.playFrom(episode, position);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('t', String(Math.floor(position)));
    window.history.replaceState(null, '', url);
  }
  return { seconds, seek };
}
