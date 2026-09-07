import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareersAttachmentUploadReceipt } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';
import { getRepository } from './repo';
import { claimCareerAttachments, MAX_CAREERS_ATTACHMENT_BYTES } from './security/form-attachments';
import type {
  ObjectStorageBucket,
  ObjectStoragePutOptions,
  ObjectStoragePutValue,
} from './storage/object-storage';

class PrivateBucket implements ObjectStorageBucket {
  objects = new Map<string, { bytes: Uint8Array; etag: string }>();
  counter = 0;
  afterPut?: (key: string, bytes: Uint8Array) => Promise<void>;
  async put(key: string, value: ObjectStoragePutValue, options?: ObjectStoragePutOptions) {
    if (options?.onlyIf?.etagMatches && this.objects.get(key)?.etag !== options.onlyIf.etagMatches)
      return null;
    const bytes = new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
    this.objects.set(key, { bytes, etag: `"object-${++this.counter}"` });
    await this.afterPut?.(key, bytes);
    return this.head(key);
  }
  async head(key: string) {
    const value = this.objects.get(key);
    return value ? { size: value.bytes.length, httpEtag: value.etag } : null;
  }
  async get(key: string) {
    const value = this.objects.get(key);
    return value
      ? { size: value.bytes.length, httpEtag: value.etag, body: new Response(value.bytes).body! }
      : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

const pdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
let counter = 0;
function fixture() {
  const bucket = new PrivateBucket();
  const env: Env = { APP_ENV: 'development', ALLOW_DEV_AUTH: 'true', MEDIA: bucket };
  const address = `198.51.100.${++counter}`;
  const email = `career-file-${counter}@example.com`;
  const upload = async (
    options: {
      type?: string;
      name?: string;
      contents?: string | Uint8Array;
      owner?: string;
      kind?: string;
      consent?: string;
    } = {},
  ) => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([options.contents ?? pdf], { type: options.type ?? 'application/pdf' }),
      options.name ?? 'السيرة الذاتية.pdf',
    );
    form.append('email', options.owner ?? email);
    form.append('kind', options.kind ?? 'cv');
    form.append('privacyAccepted', options.consent ?? 'true');
    return app.request(
      '/forms/careers/attachments',
      { method: 'POST', headers: { 'cf-connecting-ip': address }, body: form },
      env,
    );
  };
  const submit = (tokens: string[], owner = email) =>
    app.request(
      '/forms/careers',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': address },
        body: JSON.stringify({
          payload: {
            name: 'مرشح اختبار',
            email: owner,
            phone: '+966500000000',
            desiredRole: 'إنتاج',
            whyMukhtalif: 'أهتم بإنتاج المحتوى',
            skills: 'التحرير',
          },
          privacyAccepted: true,
          attachmentTokens: tokens,
        }),
      },
      env,
    );
  return { bucket, env, address, email, upload, submit };
}

async function receipt(response: Response) {
  expect(response.status).toBe(201);
  return (await response.json()) as CareersAttachmentUploadReceipt;
}
afterEach(() => vi.restoreAllMocks());

describe('private careers attachment intake', () => {
  it('never deletes a successful retry copy after releasing an earlier failed claim', async () => {
    const f = fixture();
    const uploaded = await receipt(await f.upload());
    const failed = await claimCareerAttachments(
      f.env,
      [uploaded.token],
      f.email,
      crypto.randomUUID(),
    );
    let retry: Awaited<ReturnType<typeof claimCareerAttachments>> | undefined;
    f.bucket.afterPut = async (key, bytes) => {
      if (
        key.endsWith('.json') &&
        JSON.parse(new TextDecoder().decode(bytes)).state === 'uploaded'
      ) {
        f.bucket.afterPut = undefined;
        retry = await claimCareerAttachments(f.env, [uploaded.token], f.email, crypto.randomUUID());
      }
    };
    await failed.release();
    expect(retry?.refs).toEqual([uploaded.attachment]);
    expect([...f.bucket.objects.keys()].filter((key) => key.includes('/accepted/'))).toHaveLength(
      1,
    );
    await retry?.finish();
    expect([...f.bucket.objects.keys()].filter((key) => key.includes('/accepted/'))).toHaveLength(
      1,
    );
  });
  it('uploads PDFs, binds verified refs to the application and serves only authorized Studio downloads', async () => {
    const f = fixture();
    const fetch = vi.spyOn(globalThis, 'fetch');
    const uploaded = await receipt(await f.upload());
    expect(uploaded.attachment).toMatchObject({
      mimeType: 'application/pdf',
      byteSize: new TextEncoder().encode(pdf).length,
    });
    expect(JSON.stringify(uploaded)).not.toContain('form-attachments/');
    expect((await f.submit([uploaded.token])).status).toBe(202);
    expect(fetch).not.toHaveBeenCalled();
    const stored = (await getRepository(f.env).listFormSubmissions({ type: 'careers' })).find(
      (item) => 'email' in item.payload && item.payload.email === f.email,
    )!;
    expect(stored.attachmentRefs).toEqual([uploaded.attachment]);
    expect(JSON.stringify(stored)).not.toContain(uploaded.token);
    expect([...f.bucket.objects.keys()].every((key) => key.includes('/accepted/'))).toBe(true);
    const download = `/studio/form-submissions/${stored.id}/attachments/${uploaded.attachment.id}`;
    expect((await app.request(download, {}, f.env)).status).toBe(401);
    expect(
      (await app.request(download, { headers: { 'x-dev-user': 'usr-listener-1' } }, f.env)).status,
    ).toBe(403);
    const allowed = await app.request(
      download,
      { headers: { 'x-dev-user': 'usr-admin-1' } },
      f.env,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(allowed.headers.get('content-security-policy')).toContain('sandbox');
    expect(allowed.headers.get('cache-control')).toContain('no-store');
    expect(await allowed.text()).toBe(pdf);
    expect(
      (await app.request(`/forms/attachments/${uploaded.attachment.id}`, {}, f.env)).status,
    ).toBe(404);
    expect(
      (
        await app.request(
          `/studio/form-submissions/not-owned/attachments/${uploaded.attachment.id}`,
          { headers: { 'x-dev-user': 'usr-admin-1' } },
          f.env,
        )
      ).status,
    ).toBe(404);
  });

  it('rejects changed tokens, ownership mismatch and token replay', async () => {
    const f = fixture();
    const uploaded = await receipt(await f.upload());
    expect((await f.submit([uploaded.token.slice(0, -8) + 'AAAAAAAA'])).status).toBe(422);
    expect((await f.submit([uploaded.token], 'unrelated@example.com')).status).toBe(422);
    expect((await f.submit([uploaded.token])).status).toBe(202);
    expect((await f.submit([uploaded.token])).status).toBe(422);
  });

  it('accepts at most one CV and one portfolio and normalizes applicant email', async () => {
    const f = fixture();
    const cv = await receipt(await f.upload({ owner: f.email.toUpperCase() }));
    const portfolio = await receipt(await f.upload({ kind: 'portfolio' }));
    expect((await f.submit([cv.token, cv.token])).status).toBe(422);
    expect((await f.submit([cv.token, portfolio.token])).status).toBe(202);
    const stored = (await getRepository(f.env).listFormSubmissions({ type: 'careers' })).find(
      (item) => 'email' in item.payload && item.payload.email === f.email,
    )!;
    expect(stored.attachmentRefs).toHaveLength(2);
  });

  it('rejects non-PDF bytes, active PDF actions, oversize and missing consent before storing', async () => {
    const f = fixture();
    expect(
      (
        await f.upload({
          type: 'text/html',
          name: 'cv.html',
          contents: '<script>alert(1)</script>',
        })
      ).status,
    ).toBe(415);
    expect((await f.upload({ contents: 'this is not a PDF' })).status).toBe(415);
    expect((await f.upload({ contents: '%PDF-1.4\n/JavaScript (alert(1))\n%%EOF' })).status).toBe(
      415,
    );
    expect((await f.upload({ consent: 'false' })).status).toBe(400);
    expect(
      (await f.upload({ contents: new Uint8Array(MAX_CAREERS_ATTACHMENT_BYTES + 1) })).status,
    ).toBe(413);
    expect(f.bucket.objects.size).toBe(0);
  });

  it('limits anonymous upload volume separately from form submission limits', async () => {
    const f = fixture();
    for (let n = 0; n < 6; n++) expect((await f.upload()).status).toBe(201);
    const limited = await f.upload();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('releases a claim after definitive SQL rejection so the upload can be retried', async () => {
    const f = fixture();
    const uploaded = await receipt(await f.upload());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const save = vi
      .spyOn(getRepository(f.env), 'createFormSubmission')
      .mockRejectedValueOnce(
        Object.assign(new Error('simulated constraint failure'), { code: '23514' }),
      );
    expect((await f.submit([uploaded.token])).status).toBe(500);
    save.mockRestore();
    expect((await f.submit([uploaded.token])).status).toBe(202);
    expect([...f.bucket.objects.keys()].filter((key) => key.includes('/accepted/'))).toHaveLength(
      1,
    );
  });

  it('recovers a committed application after a lost response without deleting its attachment', async () => {
    const f = fixture();
    const uploaded = await receipt(await f.upload());
    const repo = getRepository(f.env);
    const save = repo.createFormSubmission.bind(repo);
    vi.spyOn(repo, 'createFormSubmission').mockImplementationOnce(async (input) => {
      await save(input);
      throw new Error('response lost after commit');
    });
    expect((await f.submit([uploaded.token])).status).toBe(202);
    expect((await f.submit([uploaded.token])).status).toBe(422);
    const stored = (await repo.listFormSubmissions({ type: 'careers' })).filter(
      (item) => 'email' in item.payload && item.payload.email === f.email,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].attachmentRefs).toEqual([uploaded.attachment]);
    expect([...f.bucket.objects.keys()].every((key) => key.includes('/accepted/'))).toBe(true);
    const download = await app.request(
      `/studio/form-submissions/${stored[0].id}/attachments/${uploaded.attachment.id}`,
      { headers: { 'x-dev-user': 'usr-admin-1' } },
      f.env,
    );
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(pdf);
  });

  it.each(['missing', 'unavailable'] as const)(
    'preserves a potentially committed attachment when reconciliation is %s',
    async (readState) => {
      const f = fixture();
      const uploaded = await receipt(await f.upload());
      const repo = getRepository(f.env);
      const originalSave = repo.createFormSubmission.bind(repo);
      let delayedInput: Parameters<typeof originalSave>[0] | undefined;
      const save = vi.spyOn(repo, 'createFormSubmission').mockImplementationOnce(async (input) => {
        delayedInput = input;
        throw new Error('response timed out while insert may still be running');
      });
      const read = vi.spyOn(repo, 'getFormSubmission');
      if (readState === 'unavailable')
        read.mockRejectedValueOnce(new Error('database unavailable'));
      const result = await f.submit([uploaded.token]);
      expect(result.status).toBe(503);
      expect(await result.json()).toMatchObject({ code: 'SUBMISSION_STATUS_UNKNOWN' });
      expect((await f.submit([uploaded.token])).status).toBe(422);
      save.mockRestore();
      read.mockRestore();
      const committed = await originalSave(delayedInput!);
      const download = await app.request(
        `/studio/form-submissions/${committed.id}/attachments/${uploaded.attachment.id}`,
        { headers: { 'x-dev-user': 'usr-admin-1' } },
        f.env,
      );
      expect(download.status).toBe(200);
      expect(await download.text()).toBe(pdf);
    },
  );

  it('claims concurrent requests atomically and rejects expired tokens', async () => {
    const f = fixture();
    const uploaded = await receipt(await f.upload());
    const claims = await Promise.allSettled([
      claimCareerAttachments(f.env, [uploaded.token], f.email, crypto.randomUUID()),
      claimCareerAttachments(f.env, [uploaded.token], f.email, crypto.randomUUID()),
    ]);
    expect(claims.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const success = claims.find((result) => result.status === 'fulfilled');
    if (success?.status === 'fulfilled') await success.value.release();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(uploaded.expiresAt) + 1);
    expect((await f.submit([uploaded.token])).status).toBe(422);
  });
});
