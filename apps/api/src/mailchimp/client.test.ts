import { describe, expect, it, vi } from 'vitest';
import type { MailchimpConfig } from '../env';
import { MailchimpClient } from './client';

const config: MailchimpConfig = {
  apiKey: 'secret-api-key-us1',
  serverPrefix: 'us1',
  audienceId: 'audience_1',
  fromName: 'مختلف',
  replyTo: 'studio@mukhtalif.net',
  publicWebUrl: 'https://mukhtalif.net',
};

describe('Mailchimp client boundary', () => {
  it('sends HTML and plain text content without placing credentials in the URL', async () => {
    const fetcher = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
    const client = new MailchimpClient(config, fetcher);
    await client.setCampaignContent('campaign-1', '<p>html</p>', 'plain');

    const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://us1.api.mailchimp.com/3.0/campaigns/campaign-1/content');
    expect(url).not.toContain(config.apiKey);
    expect(JSON.parse(String(init.body))).toEqual({ html: '<p>html</p>', plain_text: 'plain' });
    expect(new Headers(init.headers).get('authorization')).toMatch(/^Basic /);
  });

  it('parses both ready and not-ready send checklists', async () => {
    const readyFetch = vi.fn(async () =>
      Response.json({ is_ready: true }),
    ) as unknown as typeof fetch;
    const blockedFetch = vi.fn(async () =>
      Response.json({ is_ready: false }),
    ) as unknown as typeof fetch;
    await expect(new MailchimpClient(config, readyFetch).isCampaignReady('one')).resolves.toBe(
      true,
    );
    await expect(new MailchimpClient(config, blockedFetch).isCampaignReady('two')).resolves.toBe(
      false,
    );
  });

  it('keeps the timeout active while the response body is being consumed', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      const stream = new ReadableStream({
        start(controller) {
          signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      });
      return new Response(stream, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new MailchimpClient(config, fetcher, 10);
    await expect(client.getCampaign('slow')).rejects.toMatchObject({
      status: 503,
      operation: 'get_campaign_network',
    });
  });
});
