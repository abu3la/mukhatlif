import { describe, expect, it, vi } from 'vitest';
import { HonoAdminRepository } from './hono-admin-repository';

const page = {
  items: [
    {
      email: 'noura@example.com',
      firstName: 'نورة',
      localStatus: 'explicit_consent',
      mailchimpSyncStatus: 'unconfigured',
      requestedAt: '2026-09-01T09:00:00.000Z',
      updatedAt: '2026-09-01T09:00:01.000Z',
    },
  ],
  pageInfo: {
    page: 2,
    perPage: 25,
    total: 26,
    totalPages: 2,
    hasNextPage: false,
    hasPreviousPage: true,
  },
} as const;

describe('Hono newsletter-directory adapter', () => {
  it('sends the strict paged filters in a private request body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(page));
    const repository = new HonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'usr-admin-1',
      fetch: fetcher,
    });

    await expect(
      repository.listNewsletterSubscribers({
        page: 2,
        perPage: 25,
        search: ' noura@example.com ',
        localStatus: 'explicit_consent',
        mailchimpStatus: 'unconfigured',
      }),
    ).resolves.toEqual(page);

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.test/studio/newsletter/subscribers/query');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      page: 2,
      perPage: 25,
      search: 'noura@example.com',
      localStatus: 'explicit_consent',
      mailchimpStatus: 'unconfigured',
    });
    expect(String(url)).not.toContain('noura@example.com');
    expect(new Headers(init?.headers).get('x-client-surface')).toBe('studio');
  });

  it('rejects unexpected subscriber fields instead of accepting a privacy-boundary regression', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...page,
        items: [{ ...page.items[0], syncError: 'PRIVATE_PROVIDER_ERROR' }],
      }),
    );
    const repository = new HonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'usr-admin-1',
      fetch: fetcher,
    });

    await expect(
      repository.listNewsletterSubscribers({ page: 2, perPage: 25 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects invalid paging before making a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repository = new HonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'usr-admin-1',
      fetch: fetcher,
    });

    await expect(
      repository.listNewsletterSubscribers({ page: 0, perPage: 25 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
