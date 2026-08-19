import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useStudioData } from '@/application';
import {
  AdminRepositoryError,
  createFixtureAdminRepository,
  type CreateGuestCommand,
} from '@/data';
import { demoData, type AdminViewer } from '@/lib';
import { StudioDataProvider } from './studio-data-provider';

const ADMIN_VIEWER: AdminViewer = {
  ...demoData.viewer,
  permissions: [...demoData.viewer.permissions],
};

const GUEST_COMMAND: CreateGuestCommand = {
  name: 'ندى السالم',
  role: 'باحثة اقتصادية',
  city: 'الرياض',
  email: 'nada@example.com',
  bio: 'متخصصة في الأسواق.',
};

function GuestCreationProbe() {
  const { createGuest } = useStudioData();
  return (
    <button type="button" onClick={() => void createGuest(GUEST_COMMAND)}>
      إنشاء ضيف للاختبار
    </button>
  );
}

function PublishingFailureProbe({ operation }: { operation: 'campaign' | 'send' }) {
  const {
    data,
    syncArticleNewsletterCampaign,
    sendArticleNewsletter,
  } = useStudioData();
  const [failed, setFailed] = useState(false);
  const article = data.articles[0]!;

  async function run() {
    try {
      if (operation === 'campaign') {
        await syncArticleNewsletterCampaign(article.id, article.version);
      } else {
        await sendArticleNewsletter(
          article.id,
          'fixture-audience-confirmation-v1',
          article.version,
          article.newsletter.campaignId!,
        );
      }
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void run()}>
        تشغيل عملية النشرة
      </button>
      <output data-testid="publishing-status">{article.newsletter.status}</output>
      {failed ? <output data-testid="publishing-failed">تعذّرت العملية</output> : null}
    </>
  );
}

describe('StudioDataProvider guest creation', () => {
  afterEach(cleanup);

  it('forwards the complete guest command to the repository', async () => {
    const user = userEvent.setup();
    const repository = createFixtureAdminRepository({
      now: () => new Date('2026-08-17T08:00:00.000Z'),
    });
    const createGuest = vi.spyOn(repository, 'createGuest');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudioDataProvider repository={repository} viewer={ADMIN_VIEWER}>
          <GuestCreationProbe />
        </StudioDataProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'إنشاء ضيف للاختبار' }));

    await waitFor(() => {
      expect(createGuest).toHaveBeenCalledTimes(1);
      expect(createGuest).toHaveBeenCalledWith(GUEST_COMMAND);
    });
    await waitFor(() => {
      expect(queryClient.getQueryData([
        'admin-studio',
        repository.kind,
        ADMIN_VIEWER.id,
        'guests',
      ])).toMatchObject({
        guests: expect.arrayContaining([expect.objectContaining(GUEST_COMMAND)]),
      });
    });
  });
});

describe('StudioDataProvider publishing recovery reads', () => {
  afterEach(cleanup);

  it.each([
    ['campaign', 'sync_unknown'],
    ['send', 'sending'],
  ] as const)(
    'refreshes the article after an ambiguous %s failure without masking it',
    async (operation, recoveredStatus) => {
      const user = userEvent.setup();
      const repository = createFixtureAdminRepository();
      let workspace = await repository.readContentWorkspace();
      if (operation === 'send') {
        workspace = {
          ...workspace,
          articles: workspace.articles.map((article, index) =>
            index === 0
              ? {
                  ...article,
                  newsletter: {
                    ...article.newsletter,
                    status: 'campaign_created',
                    campaignId: 'fixture-ambiguous-send',
                    syncedVersion: article.version,
                    needsSync: false,
                  },
                }
              : article,
          ),
        };
      }
      const readContentWorkspace = vi
        .spyOn(repository, 'readContentWorkspace')
        .mockImplementation(async () => structuredClone(workspace));
      const ambiguousError = new AdminRepositoryError({
        code: 'REMOTE_UNAVAILABLE',
        operation: operation === 'campaign' ? 'syncArticleNewsletterCampaign' : 'sendArticleNewsletter',
        message: 'Ambiguous provider response.',
        retryable: false,
        context: {
          remoteCode:
            operation === 'campaign'
              ? 'NEWSLETTER_SYNC_STATE_UNKNOWN'
              : 'NEWSLETTER_SEND_STATE_UNKNOWN',
        },
      });

      if (operation === 'campaign') {
        vi.spyOn(repository, 'syncArticleNewsletterCampaign').mockImplementation(async () => {
          workspace = {
            ...workspace,
            articles: workspace.articles.map((article, index) =>
              index === 0
                ? {
                    ...article,
                    newsletter: {
                      ...article.newsletter,
                      status: 'sync_unknown',
                      campaignId: 'fixture-unknown-campaign',
                      needsSync: true,
                    },
                  }
                : article,
            ),
          };
          throw ambiguousError;
        });
      } else {
        vi.spyOn(repository, 'sendArticleNewsletter').mockImplementation(async () => {
          workspace = {
            ...workspace,
            articles: workspace.articles.map((article, index) =>
              index === 0
                ? {
                    ...article,
                    newsletter: { ...article.newsletter, status: 'sending' },
                  }
                : article,
            ),
          };
          throw ambiguousError;
        });
      }

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <StudioDataProvider repository={repository} viewer={ADMIN_VIEWER}>
            <PublishingFailureProbe operation={operation} />
          </StudioDataProvider>
        </QueryClientProvider>,
      );

      await user.click(await screen.findByRole('button', { name: 'تشغيل عملية النشرة' }));
      expect(await screen.findByTestId('publishing-failed')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('publishing-status')).toHaveTextContent(recoveredStatus);
      });
      expect(readContentWorkspace).toHaveBeenCalledTimes(2);
    },
  );
});
