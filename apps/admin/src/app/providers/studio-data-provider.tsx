import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  canManagePage,
  canViewPage,
  StudioDataContext,
  type StudioDataContextValue,
} from '@/application';
import type { AdminRepository } from '@/data';
import { AdminRepositoryError } from '@/data/repository-error';
import { saveEpisodeDraft, uploadEpisodeAudioDraft } from '@/features/episodes/model/save-episode';
import type { AdminStudioContentData, AdminViewer, SocialPlatform, StudioPageId } from '@/lib';

type RefreshScope = 'core' | 'guests';

const CORE_PAGES = [
  'overview',
  'episodes',
  'shows',
  'guests',
  'articles',
] as const satisfies readonly StudioPageId[];

const EMPTY_CONTENT_DATA: AdminStudioContentData = {
  asOf: '1970-01-01T00:00:00.000Z',
  shows: [],
  episodes: [],
  articles: [],
  homepageWeeklyEpisodesSettings: {
    enabled: true,
    title: 'حلقات آخر أسبوع من مختلف',
    windowDays: 7,
    version: 1,
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  guestDirectory: null,
};

function LoadingState() {
  return (
    <main className="app-state" aria-busy="true" aria-live="polite">
      <p>جارٍ تحميل استوديو الإدارة…</p>
    </main>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry(): void }) {
  return (
    <main className="app-state" role="alert">
      <h1>تعذر تحميل استوديو الإدارة</h1>
      <p>{error.message}</p>
      <button className="button button--primary" type="button" onClick={onRetry}>
        إعادة المحاولة
      </button>
    </main>
  );
}

export function StudioDataProvider({
  children,
  repository,
  viewer,
}: {
  children: ReactNode;
  repository: AdminRepository;
  viewer: AdminViewer;
}) {
  const queryClient = useQueryClient();
  const [activeOperations, setActiveOperations] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);
  const canReadCore = CORE_PAGES.some((page) => canViewPage(viewer, page));
  const canReadGuests =
    repository.capabilities['guest-management'] && canViewPage(viewer, 'guests');
  const coreQueryKey = useMemo(
    () => ['admin-studio', repository.kind, viewer.id, 'content'] as const,
    [repository.kind, viewer.id],
  );
  const guestQueryKey = useMemo(
    () => ['admin-studio', repository.kind, viewer.id, 'guests'] as const,
    [repository.kind, viewer.id],
  );
  const coreQuery = useQuery({
    queryKey: coreQueryKey,
    queryFn: () => repository.readContentWorkspace(),
    enabled: canReadCore,
  });
  const guestQuery = useQuery({
    queryKey: guestQueryKey,
    queryFn: () => repository.readGuestDirectory(),
    enabled: canReadGuests,
  });

  const requireManage = useCallback(
    (page: Exclude<StudioPageId, 'overview'>, operation: string): void => {
      if (canManagePage(viewer, page)) return;
      throw new AdminRepositoryError({
        code: 'FORBIDDEN',
        operation,
        message: `The current viewer cannot manage ${page}.`,
        retryable: false,
        context: { page, requiredPermission: `${page}.manage` },
      });
    },
    [viewer],
  );

  const refresh = useCallback(
    async (scope: RefreshScope) => {
      if (scope === 'core') {
        queryClient.setQueryData(coreQueryKey, await repository.readContentWorkspace());
        return;
      }
      if (canReadGuests) {
        queryClient.setQueryData(guestQueryKey, await repository.readGuestDirectory());
      }
    },
    [canReadGuests, coreQueryKey, guestQueryKey, queryClient, repository],
  );

  const runOperation = useCallback(
    async <T,>(
      scope: RefreshScope,
      operation: () => Promise<T>,
      options: { readonly refreshOnError?: boolean } = {},
    ): Promise<T> => {
      setActiveOperations((count) => count + 1);
      setLastError(null);
      try {
        const result = await operation();
        await refresh(scope);
        return result;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error('Unknown admin operation error.');
        setLastError(error);
        if (options.refreshOnError) {
          try {
            await refresh(scope);
          } catch {
            // Preserve the publishing error. A failed recovery read must not replace it.
          }
        }
        throw error;
      } finally {
        setActiveOperations((count) => Math.max(0, count - 1));
      }
    },
    [refresh],
  );

  const clearLastError = useCallback(() => setLastError(null), []);

  const value = useMemo<StudioDataContextValue | null>(() => {
    if (canReadCore && !coreQuery.data) return null;
    const data: AdminStudioContentData = {
      ...(coreQuery.data ?? EMPTY_CONTENT_DATA),
      guestDirectory: canReadGuests ? (guestQuery.data ?? null) : null,
    };

    return {
      data,
      repositoryKind: repository.kind,
      capabilities: repository.capabilities,
      isMutating: activeOperations > 0,
      lastError,
      clearLastError,
      createShow: (command) => {
        requireManage('shows', 'createShow');
        return runOperation('core', async () => (await repository.createShow(command)).id);
      },
      updateHomepageWeeklyEpisodesSettings: (command) => {
        requireManage('shows', 'updateHomepageWeeklyEpisodesSettings');
        return runOperation(
          'core',
          () => repository.updateHomepageWeeklyEpisodesSettings(command),
          { refreshOnError: true },
        );
      },
      createArticle: (command) => {
        requireManage('articles', 'createArticle');
        return runOperation('core', async () => (await repository.createArticle(command)).id);
      },
      updateArticle: (id, command) => {
        requireManage('articles', 'updateArticle');
        return runOperation('core', () => repository.updateArticle(id, command));
      },
      transitionEpisodeStatus: (id, status, scheduledAt) =>
        runOperation('core', async () => {
          requireManage('episodes', 'transitionEpisodeStatus');
          await repository.transitionEpisode(id, { status, scheduledAt });
        }),
      saveEpisode: (draft, status) => {
        requireManage('episodes', 'saveEpisode');
        return runOperation('core', () => saveEpisodeDraft(repository, draft, status));
      },
      uploadEpisodeAudio: (draft) => {
        requireManage('episodes', 'uploadEpisodeAudio');
        return runOperation('core', () => uploadEpisodeAudioDraft(repository, draft));
      },
      transitionArticleStatus: (id, status, expectedVersion) =>
        runOperation('core', () => {
          requireManage('articles', 'transitionArticleStatus');
          return repository.transitionArticle(id, status, expectedVersion);
        }),
      getMailchimpCapability: () => repository.getMailchimpCapability(),
      previewArticleNewsletter: (id) => repository.previewArticleNewsletter(id),
      syncArticleNewsletterCampaign: (id, expectedVersion) =>
        runOperation(
          'core',
          () => {
            requireManage('articles', 'syncArticleNewsletterCampaign');
            return repository.syncArticleNewsletterCampaign(id, expectedVersion);
          },
          { refreshOnError: true },
        ),
      sendArticleNewsletter: (id, audienceConfirmationToken, expectedVersion, expectedCampaignId) =>
        runOperation(
          'core',
          () => {
            requireManage('articles', 'sendArticleNewsletter');
            return repository.sendArticleNewsletter(
              id,
              audienceConfirmationToken,
              expectedVersion,
              expectedCampaignId,
            );
          },
          { refreshOnError: true },
        ),
      reconcileArticleNewsletter: (id) =>
        runOperation(
          'core',
          () => {
            requireManage('articles', 'reconcileArticleNewsletter');
            return repository.reconcileArticleNewsletter(id);
          },
          { refreshOnError: true },
        ),
      listArticleMedia: () => repository.listArticleMedia(),
      listArticleAuthors: () => repository.listArticleAuthors(),
      uploadArticleImage: (command) =>
        runOperation('core', () => {
          requireManage('articles', 'uploadArticleImage');
          return repository.uploadArticleImage(command);
        }),
      createGuest: (command) =>
        runOperation('guests', async () => {
          requireManage('guests', 'createGuest');
          return (await repository.createGuest(command)).id;
        }),
      updateGuest: (id, patch) =>
        runOperation('guests', async () => {
          requireManage('guests', 'updateGuest');
          await repository.updateGuest(id, patch);
        }),
      addGuestSocial: (guestId) =>
        runOperation('guests', async () => {
          requireManage('guests', 'createGuestSocial');
          return (
            await repository.createGuestSocial({
              guestId,
              platform: 'x' as SocialPlatform,
              handle: '',
            })
          ).id;
        }),
      updateGuestSocial: (id, patch) =>
        runOperation('guests', async () => {
          requireManage('guests', 'updateGuestSocial');
          await repository.updateGuestSocial(id, patch);
        }),
      removeGuestSocial: (id) =>
        runOperation('guests', () => {
          requireManage('guests', 'removeGuestSocial');
          return repository.removeGuestSocial(id);
        }),
      addGuestAppearance: (guestId, episodeId) =>
        runOperation('guests', async () => {
          requireManage('guests', 'linkGuestAppearance');
          await repository.linkGuestAppearance(guestId, episodeId);
        }),
      removeGuestAppearance: (guestId, episodeId) =>
        runOperation('guests', () => {
          requireManage('guests', 'unlinkGuestAppearance');
          return repository.unlinkGuestAppearance(guestId, episodeId);
        }),
    };
  }, [
    activeOperations,
    canReadCore,
    canReadGuests,
    clearLastError,
    coreQuery.data,
    guestQuery.data,
    lastError,
    repository,
    requireManage,
    runOperation,
  ]);

  if ((canReadCore && coreQuery.isPending) || (canReadGuests && guestQuery.isPending)) {
    return <LoadingState />;
  }
  const queryError = coreQuery.error ?? guestQuery.error;
  if (queryError) {
    const error = queryError instanceof Error ? queryError : new Error('Unknown loading error.');
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          if (canReadCore) void coreQuery.refetch();
          if (canReadGuests) void guestQuery.refetch();
        }}
      />
    );
  }
  if (!value) return <LoadingState />;

  return <StudioDataContext.Provider value={value}>{children}</StudioDataContext.Provider>;
}
