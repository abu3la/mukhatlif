import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { anonymousCustomerFixture } from '@/test/customer-fixture';

vi.mock('./customer-provider', () => ({ useCustomer: () => anonymousCustomerFixture }));
import { PlayEpisodeButton, PlayerProvider, type PlayerEpisode } from './player';

const episode: PlayerEpisode = {
  id: 'episode-a',
  title: 'حلقة أ',
  audioSrc: 'https://api.test/episodes/a/audio',
  href: '/episodes/episode-a',
  durationSec: 3600,
};
const render = (props: Partial<React.ComponentProps<typeof PlayEpisodeButton>> = {}) =>
  renderToStaticMarkup(
    React.createElement(PlayerProvider, {
      children: React.createElement(PlayEpisodeButton, { episode, ...props }),
    }),
  );

describe('PlayEpisodeButton', () => {
  it('says what it does before anything plays, and where it starts', () => {
    expect(render()).toContain('<span>استمع الآن</span>');
    const html = render({ idleLabel: 'استمع من هنا', initialSeconds: 2052 });
    expect(html).toContain('<span>استمع من هنا</span>');
    expect(html).toContain('aria-label="تشغيل حلقة أ من 34:12"');
  });
});
