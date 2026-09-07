// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionRequest } from './production-request';

let root: Root, container: HTMLDivElement;
async function update(fn: () => void | Promise<void>) {
  await act(async () => {
    await fn();
  });
}
function set(name: string, value: string) {
  (container.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
}
async function submit() {
  await update(() => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  await update(() =>
    root.render(
      createElement(ProductionRequest, {
        apiOrigin: 'https://api.test',
        initialService: 'بودكاست',
      }),
    ),
  );
});
afterEach(async () => {
  await update(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function idea() {
  set('idea', 'برنامج عن الانتقال المهني');
  set('audience', 'الموظفون في بداية مسارهم');
  await submit();
}
async function scope() {
  set('scope', 'موسم كامل');
  set('budget', '25 إلى 75 ألف ريال');
  set('timeline', 'خلال 3 أشهر');
  set('name', 'سارة');
  set('email', 'sara@example.com');
  set('phone', '0500000000');
  await submit();
}

describe('production request', () => {
  it('validates each step and submits the complete idea once after review and consent', async () => {
    await submit();
    expect(container.querySelector('[name="idea"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(fetch).not.toHaveBeenCalled();
    await idea();
    expect(container.textContent).toContain('الخطوة 2 من 3');
    await scope();
    expect(container.textContent).toContain('راجع طلبك');
    expect(container.textContent).toContain('برنامج عن الانتقال المهني');
    expect(fetch).not.toHaveBeenCalled();
    await submit();
    expect(fetch).not.toHaveBeenCalled();
    (container.querySelector('[name="privacyAccepted"]') as HTMLInputElement).checked = true;
    await submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://api.test/forms/production_service');
    const sent = JSON.parse(String(options?.body));
    expect(sent.privacyAccepted).toBe(true);
    expect(sent.payload.email).toBe('sara@example.com');
    for (const value of [
      'برنامج عن الانتقال المهني',
      'الموظفون في بداية مسارهم',
      'بودكاست',
      'موسم كامل',
      '25 إلى 75 ألف ريال',
      'خلال 3 أشهر',
    ])
      expect(sent.payload.details).toContain(value);
    expect(container.textContent).toContain('وصل طلبك إلى مختلف.');
  });
  it('keeps draft values when navigating back and never reports success for API failure', async () => {
    await idea();
    set('name', 'سارة');
    await update(() => {
      (
        Array.from(container.querySelectorAll('button')).find(
          (button) => button.textContent === 'العودة',
        ) as HTMLButtonElement
      ).click();
    });
    expect((container.querySelector('[name="idea"]') as HTMLTextAreaElement).value).toBe(
      'برنامج عن الانتقال المهني',
    );
    await submit();
    expect((container.querySelector('[name="name"]') as HTMLInputElement).value).toBe('سارة');
    await scope();
    (container.querySelector('[name="privacyAccepted"]') as HTMLInputElement).checked = true;
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 429 } as Response);
    await submit();
    expect(container.textContent).toContain('أرسلت عدة طلبات');
    expect(container.textContent).not.toContain('وصل طلبك إلى مختلف.');
  });
  it('shows uncertain status without a resend action when the server outcome is unknown', async () => {
    await idea();
    await scope();
    (container.querySelector('[name="privacyAccepted"]') as HTMLInputElement).checked = true;
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ code: 'SUBMISSION_STATUS_UNKNOWN' }),
    } as Response);
    await submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('لم تتأكد حالة طلبك');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('وصل طلبك إلى مختلف.');
  });
});
