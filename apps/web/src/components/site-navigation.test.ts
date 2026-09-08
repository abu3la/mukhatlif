// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props),
}));
import { SiteHeader } from './site-chrome';

let root: Root;
let container: HTMLDivElement;
let main: HTMLElement;
let storage: Map<string, string>;
let showModal: ReturnType<typeof vi.fn<() => void>>;

function button(label: string) {
  const element = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}

function menu() {
  return container.querySelector('dialog')!;
}

async function update(action: () => void) {
  await act(async () => action());
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  route.pathname = '/';
  document.documentElement.dataset.concept = 'first';
  document.body.style.overflow = 'clip';
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  container = document.createElement('div');
  main = document.createElement('main');
  main.id = 'main';
  main.tabIndex = -1;
  document.body.append(container, main);
  root = createRoot(container);
  await update(() => root.render(createElement(SiteHeader)));
});

afterEach(async () => {
  await update(() => root.unmount());
  container.remove();
  main.remove();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('header navigation', () => {
  it('exposes accessible icon search beside the library and keeps appearance only inside the menu', () => {
    const outsideLinks = Array.from(container.querySelectorAll('a')).filter(
      (link) => !link.closest('dialog'),
    );
    const search = outsideLinks.find((link) => link.getAttribute('href') === '/search');
    expect(search?.textContent).toBe('');
    expect(search?.getAttribute('aria-label')).toBe('ابحث في مختلف');
    expect(search?.getAttribute('title')).toBe('ابحث في مختلف');
    expect(search?.querySelector('svg')).not.toBeNull();
    expect(search?.nextElementSibling?.getAttribute('href')).toBe('/library');
    expect(search?.nextElementSibling?.textContent).toBe('مكتبتي');
    expect(outsideLinks.find((link) => link.getAttribute('href') === '/sponsor')?.textContent).toBe(
      'الشراكات والرعايات',
    );
    expect(button('تفعيل المظهر الداكن').closest('dialog')).toBe(menu());
    expect(container.querySelectorAll('button[aria-label="تفعيل المظهر الداكن"]')).toHaveLength(1);
  });

  it('opens a native modal, focuses its close action, and restores focus and scrolling after Escape', async () => {
    const trigger = button('فتح القائمة');
    trigger.focus();
    await update(() => trigger.click());
    expect(showModal).toHaveBeenCalledOnce();
    expect(menu().open).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(button('إغلاق القائمة'));
    expect(document.body.style.overflow).toBe('hidden');

    await update(() => menu().dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(menu().open).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('clip');
  });

  it('closes on route changes and moves focus to the new main content', async () => {
    await update(() => button('فتح القائمة').click());
    await update(() => {
      route.pathname = '/shows';
      root.render(createElement(SiteHeader));
    });
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(main);
    expect(document.body.style.overflow).toBe('clip');
  });

  it('keeps the menu open when changing appearance and persists the choice', async () => {
    await update(() => button('فتح القائمة').click());
    await update(() => button('تفعيل المظهر الداكن').click());
    expect(document.documentElement.dataset.concept).toBe('third');
    expect(storage.get('mukhtalif-appearance')).toBe('third');
    expect(menu().open).toBe(true);
    expect(button('تفعيل المظهر الفاتح').textContent).toBe('المظهر الفاتح');
    await update(() => button('إغلاق القائمة').click());
    expect(document.activeElement).toBe(button('فتح القائمة'));
  });

  it('distinguishes backdrop clicks from clicks on menu padding', async () => {
    await update(() => button('فتح القائمة').click());
    vi.spyOn(menu(), 'getBoundingClientRect').mockReturnValue({
      left: 20,
      right: 600,
      top: 20,
      bottom: 600,
    } as DOMRect);
    await update(() =>
      menu().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 30, clientY: 30 })),
    );
    expect(menu().open).toBe(true);
    await update(() =>
      menu().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 })),
    );
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(button('فتح القائمة'));
  });
});
