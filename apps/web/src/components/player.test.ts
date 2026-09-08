// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCustomerLibrary } from '@/lib/customer-utils';

const fake = vi.hoisted(() => ({ customer: {} as Record<string, unknown> }));
vi.mock('./customer-provider', () => ({ useCustomer: () => fake.customer }));
import { InlineEpisodePlayer, PlayerProvider, usePlayer, type PlayerEpisode } from './player';

let root: Root;
let container: HTMLDivElement;
let player: ReturnType<typeof usePlayer>;
let media: HTMLAudioElement;
let paused = true;
let ready = 0;
let duration = Number.NaN;
let position = 0;
let rate = 1;
let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
const a: PlayerEpisode = {
  id: 'episode-a',
  title: 'حلقة أ',
  audioSrc: 'https://api.test/episodes/a/audio',
  href: '/episodes/episode-a',
  durationSec: 300,
};
const b: PlayerEpisode = {
  ...a,
  id: 'episode-b',
  title: 'حلقة ب',
  audioSrc: 'https://api.test/episodes/b/audio',
};
function Probe() {
  player = usePlayer();
  return null;
}
async function update(action: () => void | Promise<void>) {
  await act(async () => {
    await action();
  });
}
async function loaded() {
  await update(() => {
    ready = 4;
    duration = 300;
    media.dispatchEvent(new Event('loadedmetadata'));
    media.dispatchEvent(new Event('playing'));
  });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  paused = true;
  ready = 0;
  duration = Number.NaN;
  position = 0;
  rate = 1;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  fake.customer = {
    user: { id: 'customer-a' },
    library: { ...emptyCustomerLibrary(), progress: [{ episodeId: a.id, positionSec: 120 }] },
    saveProgress: vi.fn(async () => {}),
    requireAccount: vi.fn(() => true),
    config: { apiOrigin: 'https://api.test' },
    updateQueue: vi.fn(async () => {}),
    publicRead: vi.fn(),
    addBookmark: vi.fn(async () => {}),
  };
  play = vi.fn(function (this: HTMLAudioElement) {
    paused = false;
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {
    ready = 0;
    duration = Number.NaN;
    position = 0;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
  vi.spyOn(HTMLMediaElement.prototype, 'ended', 'get').mockImplementation(() => false);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(() => ready);
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockImplementation(() => duration);
  vi.spyOn(HTMLMediaElement.prototype, 'currentSrc', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return this.src;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => position);
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation((value) => {
    position = value;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'playbackRate', 'get').mockImplementation(() => rate);
  vi.spyOn(HTMLMediaElement.prototype, 'playbackRate', 'set').mockImplementation(function (
    this: HTMLMediaElement,
    value,
  ) {
    rate = value;
    this.dispatchEvent(new Event('ratechange'));
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await update(() => root.render(createElement(PlayerProvider, null, createElement(Probe))));
  media = container.querySelector('audio')!;
});
afterEach(async () => {
  if (root) await update(() => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persistent player lifecycle', () => {
  it('keeps the active episode controls available when a different episode page opens', async () => {
    await update(() => player.toggle(a));
    await loaded();
    await update(() =>
      root.render(
        createElement(
          PlayerProvider,
          null,
          createElement(Probe),
          createElement(InlineEpisodePlayer, { episode: b }),
        ),
      ),
    );
    const dock = container.querySelector('[aria-label="مشغل مختلف"]');
    expect(dock?.textContent).toContain(a.title);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    await update(() =>
      (dock?.querySelector('[aria-label="إيقاف الحلقة مؤقتًا"]') as HTMLButtonElement).click(),
    );
    expect(paused).toBe(true);
    expect(player.episode?.id).toBe(a.id);
  });
  it('uses one audio element, restores server progress after metadata, and saves the final position on close', async () => {
    await update(() => player.toggle(a));
    expect(player.status).toBe('loading');
    await loaded();
    expect(position).toBe(120);
    expect(player.isPlaying).toBe(true);
    position = 135;
    await update(() => player.close());
    expect(fake.customer.saveProgress).toHaveBeenCalledWith(a.id, 135);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(player.episode).toBeNull();
    expect(media.getAttribute('src')).toBeNull();
  });
  it('cancels loading and ignores a late failure from that play request', async () => {
    let reject!: (error: Error) => void;
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    await update(() => player.toggle(a));
    await update(() => player.toggle(a));
    await update(async () => {
      reject(new DOMException('Denied', 'NotAllowedError'));
    });
    expect(player.status).toBe('paused');
    expect(player.error).toBeNull();
    expect(player.isPlaying).toBe(false);
  });
  it('attributes the previous episode checkpoint correctly when switching episodes', async () => {
    await update(() => player.toggle(a));
    await loaded();
    position = 160;
    await update(() => player.toggle(b));
    expect(fake.customer.saveProgress).toHaveBeenCalledWith(a.id, 160);
    expect(fake.customer.saveProgress).not.toHaveBeenCalledWith(b.id, 160);
    await loaded();
    expect(player.episode?.id).toBe(b.id);
    expect(position).toBe(0);
  });
  it('updates a chapter target while the same audio source is still loading', async () => {
    await update(() => player.toggle(a));
    await update(() => player.playFrom(a, 65));
    await loaded();
    expect(position).toBe(65);
    expect(player.status).toBe('playing');
  });
  it('does not carry a pending resume position into a different episode', async () => {
    await update(() => player.toggle(a));
    await update(() => player.toggle(b));
    await loaded();
    expect(position).toBe(0);
  });
  it('keeps seeking finite and inside the media duration', async () => {
    await update(() => player.toggle(a));
    await loaded();
    await update(() => player.seek(500));
    expect(position).toBe(300);
    await update(() => player.seek(-50));
    expect(position).toBe(0);
  });
  it('persists the full playback speed range', async () => {
    await update(() => player.setPlaybackRate(0.75));
    expect(rate).toBe(0.75);
    expect(player.playbackRate).toBe(0.75);
    expect(localStorage.getItem('mukhtalif-playback-rate')).toBe('0.75');
  });
  it('offers the actual episode video when audio is missing', async () => {
    await update(() => player.toggle({ ...a, audioSrc: '', youtubeVideoId: 'abcdefghijk' }));
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe(
      '/episodes/episode-a#episode-video',
    );
  });
  it('captures the moment when the bookmark action is opened rather than the later submit time', async () => {
    await update(() => player.toggle(a));
    await loaded();
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="احفظ اللحظة"]')!;
    await update(() => trigger.click());
    position = 145;
    await update(() => {
      media.dispatchEvent(new Event('timeupdate'));
    });
    const form = container.querySelector('dialog[open] form')!;
    await update(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fake.customer.addBookmark).toHaveBeenCalledWith(a.id, 120, '');
  });
});
