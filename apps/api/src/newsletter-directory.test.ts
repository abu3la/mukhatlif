import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsletterSubscriberListItem, PaginatedList } from '@mukhtalif/types';
import app from './index';
import type { Env } from './env';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

function studioRequest(path: string, identityId?: string) {
  return app.request(
    path,
    {
      headers: {
        'x-client-surface': 'studio',
        ...(identityId ? { 'x-dev-user': identityId } : {}),
      },
    },
    localEnv,
  );
}

function studioDirectoryRequest(body: unknown, identityId?: string) {
  return app.request(
    '/studio/newsletter/subscribers/query',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-surface': 'studio',
        ...(identityId ? { 'x-dev-user': identityId } : {}),
      },
      body: JSON.stringify(body),
    },
    localEnv,
  );
}

async function createLocalSubscriber(email: string, firstName: string) {
  const response = await app.request(
    '/newsletter/subscriptions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
      },
      body: JSON.stringify({ email, firstName, consentAccepted: true }),
    },
    localEnv,
  );
  expect(response.status).toBe(202);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Studio newsletter subscriber directory', () => {
  it('returns a privacy-minimized, searchable local snapshot without contacting Mailchimp', async () => {
    const token = crypto.randomUUID().slice(0, 8);
    const email = `directory-${token}@example.com`;
    await createLocalSubscriber(email, `نورة ${token}`);
    const providerFetch = vi.fn();
    vi.stubGlobal('fetch', providerFetch);

    const response = await studioDirectoryRequest(
      {
        search: token,
        localStatus: 'explicit_consent',
        mailchimpStatus: 'unconfigured',
      },
      'usr-admin-1',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const page = (await response.json()) as PaginatedList<NewsletterSubscriberListItem>;
    expect(page.pageInfo).toMatchObject({ page: 1, perPage: 25, total: 1 });
    expect(page.items).toEqual([
      expect.objectContaining({
        email,
        firstName: `نورة ${token}`,
        localStatus: 'explicit_consent',
        mailchimpSyncStatus: 'unconfigured',
      }),
    ]);
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      'email',
      'firstName',
      'localStatus',
      'mailchimpSyncStatus',
      'requestedAt',
      'updatedAt',
    ]);
    expect(JSON.stringify(page)).not.toContain('sourceMetadata');
    expect(JSON.stringify(page)).not.toContain('syncError');
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('paginates a filtered search deterministically', async () => {
    const token = crypto.randomUUID().slice(0, 8);
    await createLocalSubscriber(`page-${token}-a@example.com`, 'أمل');
    await createLocalSubscriber(`page-${token}-b@example.com`, 'بدر');

    const response = await studioDirectoryRequest(
      { search: token, page: 2, perPage: 1 },
      'usr-admin-1',
    );
    expect(response.status).toBe(200);
    const page = (await response.json()) as PaginatedList<NewsletterSubscriberListItem>;
    expect(page.pageInfo).toMatchObject({ page: 2, perPage: 1, total: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.email).toContain(token);
  });

  it('requires subscriber-view permission before returning any email address', async () => {
    expect((await studioDirectoryRequest({})).status).toBe(401);
    expect((await studioDirectoryRequest({}, 'usr-editor-1')).status).toBe(403);
  });

  it('rejects malformed filters, paging, and unknown body keys', async () => {
    for (const body of [
      { page: 0 },
      { perPage: 101 },
      { localStatus: 'unknown' },
      { mailchimpStatus: 'active' },
      { unexpected: true },
    ]) {
      const response = await studioDirectoryRequest(body, 'usr-admin-1');
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('does not expose the private directory through a GET URL', async () => {
    expect(
      (
        await studioRequest(
          '/studio/newsletter/subscribers?search=person@example.com',
          'usr-admin-1',
        )
      ).status,
    ).toBe(404);
  });
});
