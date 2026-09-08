// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LatestEpisodeAction, ShareButton } from './public-content-controls';
const { player } = vi.hoisted(() => ({
  player: { status: 'loading', isPlaying: false, isCurrent: () => true, toggle: vi.fn() },
}));
vi.mock('./player', () => ({ usePlayer: () => player }));
let root: Root, container: HTMLDivElement;
async function update(fn: () => void) {
  await act(async () => {
    fn();
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  player.toggle.mockReset();
});
afterEach(async () => {
  await update(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('announces loading and lets the user cancel the active hero request', async () => {
  const episode = { id: 'ep1', title: 'حلقة', audioSrc: '/audio' };
  await update(() => root.render(createElement(LatestEpisodeAction, { episode })));
  const button = container.querySelector('button')!;
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.getAttribute('aria-label')).toContain('إلغاء تحميل');
  expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  await update(() => button.click());
  expect(player.toggle).toHaveBeenCalledWith(episode);
});
it('copies an actual article URL and announces success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await update(() =>
    root.render(createElement(ShareButton, { title: 'قراءة', path: '/articles/example' })),
  );
  await update(() => container.querySelector('button')!.click());
  expect(writeText).toHaveBeenCalledWith(new URL('/articles/example', window.location.origin).href);
  expect(container.querySelector('[role="status"]')?.textContent).toBe('نُسخ الرابط.');
});
it('offers a selectable real URL if clipboard access is unavailable', async () => {
  vi.stubGlobal('navigator', {});
  await update(() =>
    root.render(createElement(ShareButton, { title: 'قراءة', path: '/articles/example' })),
  );
  await update(() => container.querySelector('button')!.click());
  const input = container.querySelector('input')!;
  expect(input.readOnly).toBe(true);
  expect(input.value).toBe(new URL('/articles/example', window.location.origin).href);
});
