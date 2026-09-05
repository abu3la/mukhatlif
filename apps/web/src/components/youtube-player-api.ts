export interface YouTubePlayer {
  pauseVideo(): void;
  destroy(): void;
}
interface YouTubeApi {
  Player: new (
    frame: HTMLIFrameElement,
    options: {
      events: { onStateChange(event: { data: number }): void };
    },
  ) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let pending: Promise<YouTubeApi> | undefined;
/** The embed renders without this SDK; it only coordinates audio playback. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (window.YT?.Player) resolve(window.YT);
      previous?.();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      pending = undefined;
      script.remove();
      reject(new Error('YouTube playback coordination unavailable'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
