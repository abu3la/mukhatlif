import { md5 } from '@noble/hashes/legacy';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { MAILCHIMP_NEWSLETTER_RECIPIENT_TAG, type NewsletterMailchimpConfig } from '../env';

export const NEWSLETTER_MAILCHIMP_TAG = MAILCHIMP_NEWSLETTER_RECIPIENT_TAG;

interface MailchimpMemberResponse {
  id?: unknown;
  status?: unknown;
}

type MailchimpMemberStatus = 'subscribed' | 'pending' | 'unsubscribed' | 'cleaned';
type MailchimpAudienceOperation = 'get_member' | 'put_member' | 'tag_member';

export class MailchimpAudienceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'MAILCHIMP_AUDIENCE_REJECTED'
      | 'MAILCHIMP_AUDIENCE_UNAVAILABLE'
      | 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE'
      | 'MAILCHIMP_AUDIENCE_STATUS_BLOCKED'
      | 'MAILCHIMP_AUDIENCE_TAG_FAILED',
  ) {
    super('Mailchimp audience subscription request failed');
    this.name = 'MailchimpAudienceApiError';
  }
}

export function mailchimpSubscriberHash(email: string): string {
  return bytesToHex(md5(utf8ToBytes(email.trim().toLowerCase())));
}

function memberStatus(value: unknown, subscriberHash: string): string {
  if (!value || typeof value !== 'object') {
    throw new MailchimpAudienceApiError(502, 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE');
  }
  const member = value as MailchimpMemberResponse;
  if (member.id !== subscriberHash || typeof member.status !== 'string') {
    throw new MailchimpAudienceApiError(502, 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE');
  }
  return member.status;
}

function isKnownMemberStatus(value: string): value is MailchimpMemberStatus {
  return ['subscribed', 'pending', 'unsubscribed', 'cleaned'].includes(value);
}

/**
 * Implements explicit, status-aware double opt-in.
 *
 * - A missing member is created with `status_if_new: pending`.
 * - A subscribed or already-pending member is never given another status.
 * - An unsubscribed member is explicitly moved to `pending`, which asks
 *   Mailchimp to send a new confirmation request.
 * - A cleaned or unknown status fails closed without a member mutation.
 *
 * The source tag is written through Mailchimp's dedicated member-tags endpoint
 * only after the member step is safe. If tagging fails, a retry sees `pending`
 * and retries only the tag instead of sending another confirmation.
 */
export class MailchimpAudienceClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    private readonly config: NewsletterMailchimpConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    this.baseUrl = `https://${config.serverPrefix}.api.mailchimp.com/3.0`;
    this.authorization = `Basic ${btoa(`mukhtalif:${config.apiKey}`)}`;
  }

  private error(status: number, operation: MailchimpAudienceOperation): MailchimpAudienceApiError {
    if (operation === 'tag_member') {
      return new MailchimpAudienceApiError(status, 'MAILCHIMP_AUDIENCE_TAG_FAILED');
    }
    return new MailchimpAudienceApiError(
      status,
      status >= 400 && status < 500
        ? 'MAILCHIMP_AUDIENCE_REJECTED'
        : 'MAILCHIMP_AUDIENCE_UNAVAILABLE',
    );
  }

  private async requestJson(
    path: string,
    operation: Exclude<MailchimpAudienceOperation, 'tag_member'>,
    init?: RequestInit,
    allowNotFound = false,
  ): Promise<unknown | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: this.authorization,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
      });
      if (allowNotFound && response.status === 404) {
        await response.text();
        return null;
      }
      if (!response.ok) {
        await response.text();
        throw this.error(response.status, operation);
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        if (controller.signal.aborted) throw this.error(503, operation);
        throw new MailchimpAudienceApiError(502, 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE');
      }
    } catch (error) {
      if (error instanceof MailchimpAudienceApiError) throw error;
      throw this.error(503, operation);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async activateSourceTag(subscriberHash: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/lists/${encodeURIComponent(this.config.audienceId)}/members/${subscriberHash}/tags`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            Authorization: this.authorization,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tags: [{ name: NEWSLETTER_MAILCHIMP_TAG, status: 'active' }],
          }),
        },
      );
      if (!response.ok) {
        await response.text();
        throw this.error(response.status, 'tag_member');
      }
      await response.text();
    } catch (error) {
      if (error instanceof MailchimpAudienceApiError) throw error;
      throw this.error(503, 'tag_member');
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestDoubleOptIn(email: string, firstName?: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const subscriberHash = mailchimpSubscriberHash(normalizedEmail);
    const memberPath = `/lists/${encodeURIComponent(this.config.audienceId)}/members/${subscriberHash}`;
    const currentValue = await this.requestJson(
      `${memberPath}?fields=id%2Cstatus`,
      'get_member',
      undefined,
      true,
    );

    if (currentValue === null) {
      const created = await this.requestJson(memberPath, 'put_member', {
        method: 'PUT',
        body: JSON.stringify({
          email_address: normalizedEmail,
          status_if_new: 'pending',
          ...(firstName ? { merge_fields: { FNAME: firstName } } : {}),
        }),
      });
      if (memberStatus(created, subscriberHash) !== 'pending') {
        throw new MailchimpAudienceApiError(502, 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE');
      }
    } else {
      const status = memberStatus(currentValue, subscriberHash);
      if (!isKnownMemberStatus(status) || status === 'cleaned') {
        throw new MailchimpAudienceApiError(409, 'MAILCHIMP_AUDIENCE_STATUS_BLOCKED');
      }
      if (status === 'unsubscribed') {
        const updated = await this.requestJson(memberPath, 'put_member', {
          method: 'PUT',
          body: JSON.stringify({
            email_address: normalizedEmail,
            status: 'pending',
            status_if_new: 'pending',
            ...(firstName ? { merge_fields: { FNAME: firstName } } : {}),
          }),
        });
        if (memberStatus(updated, subscriberHash) !== 'pending') {
          throw new MailchimpAudienceApiError(502, 'MAILCHIMP_AUDIENCE_INVALID_RESPONSE');
        }
      }
      // subscribed and pending are intentionally untouched.
    }

    await this.activateSourceTag(subscriberHash);
  }
}
