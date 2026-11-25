// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ContentSkeleton, SkeletonFeature, SkeletonSection, StageSkeleton } from './content-skeleton';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('content loading placeholders', () => {
  it('announces loading once and keeps decorative placeholders out of the accessibility tree', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(createElement(ContentSkeleton, { label: 'تحميل البرامج', variant: 'cards' })));
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="status"]')?.className).toBe('loading-announcement');
    expect(
      host.querySelector('[aria-hidden="true"]')?.querySelectorAll('.content-skeleton__item'),
    ).toHaveLength(3);
    expect(host.querySelectorAll('button, a, input')).toHaveLength(0);
    await act(async () => root.render(createElement('h2', null, 'البرامج')));
    expect(host.querySelector('[aria-busy]')).toBeNull();
    expect(host.querySelector('h2')?.textContent).toBe('البرامج');
    await act(async () => root.unmount());
  });

  it('gives a waiting page its stage and sheet, announced once, with every shape hidden', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          StageSkeleton,
          { label: 'تحميل الحلقات…', cross: true, field: true },
          createElement(SkeletonFeature),
          createElement(SkeletonSection, { covers: 4 }),
        ),
      ),
    );
    const page = host.querySelector('.stage-page');
    expect(page?.classList.contains('has-cross')).toBe(true);
    expect(page?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('تحميل الحلقات…');
    // The stage and the sheet are both hidden; only the status speaks.
    expect(host.querySelector('.stage-scope')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.home-sheet')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelectorAll('.stage-skeleton__cover')).toHaveLength(4);
    expect(host.querySelectorAll('button, a, input, h1, h2')).toHaveLength(0);
    await act(async () => root.unmount());
  });
});
