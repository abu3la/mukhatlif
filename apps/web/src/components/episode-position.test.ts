// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ current: false, currentTime: 24, playFrom: vi.fn() }));
vi.mock('./player', () => ({
  usePlayer: () => ({
    isCurrent: () => fake.current,
    currentTime: fake.currentTime,
    playFrom: fake.playFrom,
  }),
}));
import { useEpisodePosition } from './episode-position';
let root: Root, container: HTMLDivElement, position: ReturnType<typeof useEpisodePosition>;
const episode = { id: 'episode-1', title: 'الحلقة', audioSrc: 'https://api.test/audio' };
function Probe() {
  position = useEpisodePosition(episode, 'LyxZez5Nixk', 15);
  return null;
}
async function update(fn: () => void) {
  await act(async () => {
    fn();
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fake.current = false;
  fake.playFrom.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await update(() => root.render(createElement(Probe)));
});
afterEach(async () => {
  await update(() => root.unmount());
  container.remove();
});
describe('episode medium position', () => {
  it('captures the real video timestamp and directs chapter seeking to video', async () => {
    const seek = vi.fn();
    window.addEventListener('mukhtalif:chapter-seek', seek);
    await update(() => {
      window.dispatchEvent(
        new CustomEvent('mukhtalif:video-time', {
          detail: { videoId: 'LyxZez5Nixk', seconds: 83.9, playing: true },
        }),
      );
    });
    expect(position.seconds).toBe(83);
    await update(() => position.seek(120));
    expect(seek.mock.calls[0]?.[0].detail).toEqual({ videoId: 'LyxZez5Nixk', seconds: 120 });
    expect(fake.playFrom).not.toHaveBeenCalled();
    expect(new URL(window.location.href).searchParams.get('t')).toBe('120');
    window.removeEventListener('mukhtalif:chapter-seek', seek);
  });
  it('returns to audio when audio starts and ignores other videos', async () => {
    await update(() => {
      window.dispatchEvent(
        new CustomEvent('mukhtalif:video-time', {
          detail: { videoId: 'LyxZez5Nixk', seconds: 83, playing: true },
        }),
      );
    });
    fake.current = true;
    await update(() => {
      window.dispatchEvent(new Event('mukhtalif:audio-start'));
    });
    await update(() => {
      window.dispatchEvent(
        new CustomEvent('mukhtalif:video-time', {
          detail: { videoId: 'otherVideo1', seconds: 999, playing: true },
        }),
      );
    });
    expect(position.seconds).toBe(24);
    await update(() => position.seek(75));
    expect(fake.playFrom).toHaveBeenCalledWith(episode, 75);
  });
});
