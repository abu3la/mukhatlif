// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BusyButton } from './busy-button';

it('shows pending work, blocks duplicate clicks, and restores the action afterwards', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const action = vi.fn();
  try {
    await act(async () => root.render(createElement(BusyButton, { 'aria-busy': true, onClick: action }, 'جار التحقق…')));
    const button = host.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('.action-loading-indicator')?.getAttribute('aria-hidden')).toBe('true');
    button.click();
    expect(action).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(BusyButton, { 'aria-busy': false, onClick: action }, 'تحقّق')));
    expect(button.disabled).toBe(false);
    expect(button.querySelector('.action-loading-indicator')).toBeNull();
    button.click();
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(BusyButton, { disabled: true }, 'غير متاح')));
    expect(button.disabled).toBe(true);
    expect(button.querySelector('.action-loading-indicator')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('replaces an icon with the indicator while preserving its accessible action name', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(BusyButton, {
      className: 'customer-icon-button', 'aria-label': 'إزالة الحلقة', 'aria-busy': true,
    }, createElement('svg', { 'data-icon': 'remove' }))));
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('إزالة الحلقة');
    expect(host.querySelector('.action-loading-indicator')).not.toBeNull();
    expect(host.querySelector('svg')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
