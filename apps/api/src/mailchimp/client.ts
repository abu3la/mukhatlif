import type { MailchimpConfig } from '../env';

export interface MailchimpCampaign {
  id: string;
  status: string;
  sendTime?: string;
  audienceId?: string;
}

interface MailchimpCampaignResponse {
  id?: unknown;
  status?: unknown;
  send_time?: unknown;
  recipients?: { list_id?: unknown };
}

interface MailchimpChecklistResponse {
  is_ready?: unknown;
}

interface MailchimpAudienceResponse {
  name?: unknown;
  stats?: { member_count?: unknown };
}

export interface MailchimpAudienceSummary {
  name: string;
  count: number;
}

export class MailchimpApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly operation: string,
  ) {
    super(`Mailchimp operation failed: ${operation}`);
    this.name = 'MailchimpApiError';
  }
}

function campaignFrom(value: MailchimpCampaignResponse): MailchimpCampaign {
  if (typeof value.id !== 'string' || typeof value.status !== 'string') {
    throw new MailchimpApiError(502, 'invalid_response');
  }
  return {
    id: value.id,
    status: value.status,
    sendTime: typeof value.send_time === 'string' ? value.send_time : undefined,
    audienceId:
      typeof value.recipients?.list_id === 'string' ? value.recipients.list_id : undefined,
  };
}

export class MailchimpClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(
    private readonly config: MailchimpConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    this.baseUrl = `https://${config.serverPrefix}.api.mailchimp.com/3.0`;
    this.authorization = `Basic ${btoa(`mukhtalif:${config.apiKey}`)}`;
  }

  private async request<T>(path: string, operation: string, init?: RequestInit): Promise<T> {
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
      if (!response.ok) {
        // Consume the response for connection reuse, but never reflect provider
        // details because they may contain audience or account information.
        await response.text();
        throw new MailchimpApiError(response.status, operation);
      }
      if (response.status === 204) return undefined as T;
      try {
        return (await response.json()) as T;
      } catch {
        if (controller.signal.aborted) {
          throw new MailchimpApiError(503, `${operation}_network`);
        }
        throw new MailchimpApiError(502, `${operation}_invalid_response`);
      }
    } catch (error) {
      if (error instanceof MailchimpApiError) throw error;
      throw new MailchimpApiError(503, `${operation}_network`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private settings(subject: string, preheader: string | undefined, internalTitle: string) {
    return {
      subject_line: subject,
      preview_text: preheader ?? '',
      title: internalTitle,
      from_name: this.config.fromName,
      reply_to: this.config.replyTo,
      auto_footer: false,
    };
  }

  async createCampaign(
    subject: string,
    preheader: string | undefined,
    internalTitle: string,
  ): Promise<MailchimpCampaign> {
    const value = await this.request<MailchimpCampaignResponse>('/campaigns', 'create_campaign', {
      method: 'POST',
      body: JSON.stringify({
        type: 'regular',
        recipients: { list_id: this.config.audienceId },
        settings: this.settings(subject, preheader, internalTitle),
      }),
    });
    return campaignFrom(value);
  }

  async getAudienceSummary(): Promise<MailchimpAudienceSummary> {
    const value = await this.request<MailchimpAudienceResponse>(
      `/lists/${encodeURIComponent(this.config.audienceId)}?fields=name%2Cstats.member_count`,
      'get_audience',
    );
    if (
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      typeof value.stats?.member_count !== 'number' ||
      !Number.isInteger(value.stats.member_count) ||
      value.stats.member_count < 0
    ) {
      throw new MailchimpApiError(502, 'get_audience_invalid_response');
    }
    return { name: value.name, count: value.stats.member_count };
  }

  async getCampaign(campaignId: string): Promise<MailchimpCampaign> {
    const value = await this.request<MailchimpCampaignResponse>(
      `/campaigns/${encodeURIComponent(campaignId)}`,
      'get_campaign',
    );
    return campaignFrom(value);
  }

  async updateCampaign(
    campaignId: string,
    subject: string,
    preheader: string | undefined,
    internalTitle: string,
  ): Promise<MailchimpCampaign> {
    const value = await this.request<MailchimpCampaignResponse>(
      `/campaigns/${encodeURIComponent(campaignId)}`,
      'update_campaign',
      {
        method: 'PATCH',
        body: JSON.stringify({ settings: this.settings(subject, preheader, internalTitle) }),
      },
    );
    return campaignFrom(value);
  }

  async setCampaignContent(campaignId: string, html: string, plainText: string): Promise<void> {
    await this.request<unknown>(
      `/campaigns/${encodeURIComponent(campaignId)}/content`,
      'set_campaign_content',
      { method: 'PUT', body: JSON.stringify({ html, plain_text: plainText }) },
    );
  }

  async isCampaignReady(campaignId: string): Promise<boolean> {
    const value = await this.request<MailchimpChecklistResponse>(
      `/campaigns/${encodeURIComponent(campaignId)}/send-checklist`,
      'get_send_checklist',
    );
    if (typeof value.is_ready !== 'boolean') {
      throw new MailchimpApiError(502, 'send_checklist_invalid_response');
    }
    return value.is_ready;
  }

  async sendCampaign(campaignId: string): Promise<void> {
    await this.request<unknown>(
      `/campaigns/${encodeURIComponent(campaignId)}/actions/send`,
      'send_campaign',
      { method: 'POST' },
    );
  }
}
