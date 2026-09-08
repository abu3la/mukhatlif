// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestForm } from './request-form';
let root: Root, container: HTMLDivElement, attached: File | null;
const NativeFormData = FormData;
async function update(fn: () => void) {
  await act(async () => {
    fn();
  });
}
async function submit() {
  await update(() => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
function set(name: string, value: string) {
  (container.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  attached = null;
  vi.stubGlobal(
    'FormData',
    class extends NativeFormData {
      constructor(form?: HTMLFormElement) {
        super(form);
        if (form && attached) this.set('cv', attached);
      }
    },
  );
  vi.stubGlobal('fetch', vi.fn());
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await update(() =>
    root.render(createElement(RequestForm, { apiOrigin: 'https://api.test', type: 'careers' })),
  );
});
afterEach(async () => {
  await update(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function fill() {
  for (const [name, value] of Object.entries({
    name: 'سارة',
    email: 'sara@example.com',
    phone: '0500000000',
    desiredRole: 'تحرير',
    whyMukhtalif: 'أود إعداد الحوارات',
    skills: 'الكتابة والتحرير',
  }))
    set(name, value);
  (container.querySelector('[name="privacyAccepted"]') as HTMLInputElement).checked = true;
}
describe('career attachment intake', () => {
  it('validates fields before upload, then passes only server attachment tokens into the request', async () => {
    attached = new File(['%PDF-1.7\n%%EOF'], 'cv.pdf', { type: 'application/pdf' });
    await submit();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector('[name="name"]')?.getAttribute('aria-invalid')).toBe('true');
    fill();
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'signed-private-token',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    await submit();
    expect(fetch).toHaveBeenCalledTimes(2);
    const [uploadUrl, uploadOptions] = vi.mocked(fetch).mock.calls[0]!;
    expect(uploadUrl).toBe('https://api.test/forms/careers/attachments');
    const body = uploadOptions?.body as FormData;
    expect(body.get('email')).toBe('sara@example.com');
    expect(body.get('kind')).toBe('cv');
    expect(body.get('privacyAccepted')).toBe('true');
    expect(body.get('file')).toBeInstanceOf(File);
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body));
    expect(sent.attachmentTokens).toEqual(['signed-private-token']);
    expect(sent.payload).not.toHaveProperty('cv');
    expect(container.textContent).toContain('وصل طلبك');
  });
  it('does not submit a career request when the attachment upload fails', async () => {
    attached = new File(['bad PDF'], 'cv.pdf', { type: 'application/pdf' });
    fill();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400 } as Response);
    await submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('اختر ملف PDF صالحًا');
    expect(container.textContent).not.toContain('وصل طلبك');
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
  });
  it('submits a career request without uploading when no files were selected', async () => {
    fill();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    await submit();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://api.test/forms/careers');
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).not.toHaveProperty(
      'attachmentTokens',
    );
  });
  it('does not retry or reupload when the server cannot confirm submission status', async () => {
    attached = new File(['%PDF-1.7\n%%EOF'], 'cv.pdf', { type: 'application/pdf' });
    fill();
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'leased-token',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ code: 'SUBMISSION_STATUS_UNKNOWN' }),
      } as Response);
    await submit();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('لم تتأكد حالة طلبك');
    expect(container.textContent).toContain('لا تعِد إرساله');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('وصل طلبك');
  });
});
