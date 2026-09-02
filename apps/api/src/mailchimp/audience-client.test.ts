import { describe, expect, it, vi } from 'vitest';
import type { NewsletterMailchimpConfig } from '../env';
import {
  MailchimpAudienceClient,
  NEWSLETTER_MAILCHIMP_TAG,
  mailchimpSubscriberHash,
} from './audience-client';

const config: NewsletterMailchimpConfig = {
  apiKey: 'newsletter-api-key-us21',
  serverPrefix: 'us21',
  audienceId: 'legacy_audience',
};

function queuedFetch(...responses: Response[]): typeof fetch {
  let index = 0;
  return vi.fn(async () => {
    const response = responses[index++];
    if (!response) throw new Error('Unexpected Mailchimp request');
    return response;
  }) as unknown as typeof fetch;
}

function call(fetcher: typeof fetch, index: number): [string, RequestInit] {
  return (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[index] as [
    string,
    RequestInit,
  ];
}

describe('Mailchimp newsletter audience boundary', () => {
  it('uses the Mailchimp lowercase-email MD5 member identity', () => {
    expect(mailchimpSubscriberHash(' Test@Example.com ')).toBe(
      '55502f40dc8b7c769880b10874abc9d0',
    );
  });

  it('creates a missing member as pending, then activates the source tag separately', async () => {
    const email = 'person@example.com';
    const memberHash = mailchimpSubscriberHash(email);
    const fetcher = queuedFetch(
      new Response('{"detail":"not found"}', { status: 404 }),
      Response.json({ id: memberHash, status: 'pending' }),
      new Response(null, { status: 204 }),
    );

    await new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn(
      ' Person@Example.com ',
      'نورة',
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    const [getUrl, getInit] = call(fetcher, 0);
    expect(getUrl).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/legacy_audience/members/${memberHash}?fields=id%2Cstatus`,
    );
    expect(getInit.method).toBeUndefined();
    expect(getUrl).not.toContain(config.apiKey);
    expect(new Headers(getInit.headers).get('authorization')).toMatch(/^Basic /);

    const [putUrl, putInit] = call(fetcher, 1);
    expect(putUrl).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/legacy_audience/members/${memberHash}`,
    );
    expect(putInit.method).toBe('PUT');
    const memberBody = JSON.parse(String(putInit.body)) as Record<string, unknown>;
    expect(memberBody).toEqual({
      email_address: email,
      status_if_new: 'pending',
      merge_fields: { FNAME: 'نورة' },
    });
    expect(memberBody).not.toHaveProperty('status');
    expect(memberBody).not.toHaveProperty('tags');

    const [tagUrl, tagInit] = call(fetcher, 2);
    expect(tagUrl).toBe(
      `https://us21.api.mailchimp.com/3.0/lists/legacy_audience/members/${memberHash}/tags`,
    );
    expect(tagInit.method).toBe('POST');
    expect(JSON.parse(String(tagInit.body))).toEqual({
      tags: [{ name: NEWSLETTER_MAILCHIMP_TAG, status: 'active' }],
    });
  });

  it.each(['subscribed', 'pending'] as const)(
    'leaves an existing %s member status untouched and only activates the tag',
    async (status) => {
      const email = `${status}@example.com`;
      const memberHash = mailchimpSubscriberHash(email);
      const fetcher = queuedFetch(
        Response.json({ id: memberHash, status }),
        new Response(null, { status: 204 }),
      );

      await new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn(email, 'سارة');

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(call(fetcher, 0)[1].method).toBeUndefined();
      expect(call(fetcher, 1)[1].method).toBe('POST');
      expect(call(fetcher, 1)[0]).toMatch(/\/tags$/);
      expect(
        (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
          (entry) => (entry[1] as RequestInit).method === 'PUT',
        ),
      ).toBe(false);
    },
  );

  it('moves only an explicitly unsubscribed member to pending before tagging', async () => {
    const email = 'unsubscribed@example.com';
    const memberHash = mailchimpSubscriberHash(email);
    const fetcher = queuedFetch(
      Response.json({ id: memberHash, status: 'unsubscribed' }),
      Response.json({ id: memberHash, status: 'pending' }),
      new Response(null, { status: 204 }),
    );

    await new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn(email, 'ليان');

    expect(fetcher).toHaveBeenCalledTimes(3);
    const memberBody = JSON.parse(String(call(fetcher, 1)[1].body)) as Record<string, unknown>;
    expect(memberBody).toEqual({
      email_address: email,
      status: 'pending',
      status_if_new: 'pending',
      merge_fields: { FNAME: 'ليان' },
    });
    expect(memberBody).not.toHaveProperty('tags');
    expect(call(fetcher, 2)[1].method).toBe('POST');
  });

  it.each(['cleaned', 'transactional', 'archived'])(
    'fails closed for the %s status without changing or tagging the member',
    async (status) => {
      const email = `${status}@example.com`;
      const memberHash = mailchimpSubscriberHash(email);
      const fetcher = queuedFetch(Response.json({ id: memberHash, status }));

      await expect(
        new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn(email),
      ).rejects.toMatchObject({ code: 'MAILCHIMP_AUDIENCE_STATUS_BLOCKED' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('reports a tag failure after a safe member result so a retry will not reconfirm', async () => {
    const email = 'tag-failure@example.com';
    const memberHash = mailchimpSubscriberHash(email);
    const fetcher = queuedFetch(
      Response.json({ id: memberHash, status: 'pending' }),
      new Response('{"detail":"tag unavailable"}', { status: 503 }),
    );

    await expect(
      new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn(email),
    ).rejects.toMatchObject({ code: 'MAILCHIMP_AUDIENCE_TAG_FAILED', status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(call(fetcher, 1)[1].method).toBe('POST');
  });

  it('does not leak a provider error body through its stable failure code', async () => {
    const fetcher = queuedFetch(
      new Response('{"detail":"person@example.com is archived in Secret Audience"}', {
        status: 400,
      }),
    );

    await expect(
      new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn('person@example.com'),
    ).rejects.toMatchObject({ code: 'MAILCHIMP_AUDIENCE_REJECTED', status: 400 });
  });

  it('fails closed when a successful response does not identify the requested member', async () => {
    const fetcher = queuedFetch(Response.json({ id: 'different-member', status: 'pending' }));
    await expect(
      new MailchimpAudienceClient(config, fetcher).requestDoubleOptIn('person@example.com'),
    ).rejects.toMatchObject({ code: 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE' });
  });
});
