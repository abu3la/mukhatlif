import { createContext, useContext } from 'react';
import type {
  AdminRepositoryCapabilities,
  AdminRepositoryKind,
  AdminNewsletterCampaignResult,
  AdminNewsletterSendResult,
  ArticleMediaAsset,
  CreateArticleCommand,
  CreateGuestCommand,
  CreateShowCommand,
  UpdateHomepageWeeklyEpisodesSettingsCommand,
  UpdateArticleCommand,
  UploadArticleImageCommand,
} from '@/data';
import type {
  AdminStudioContentData,
  ArticleId,
  Article,
  ArticleAuthorCandidate,
  ArticleStatus,
  EpisodeId,
  EpisodeStatus,
  Guest,
  GuestId,
  GuestSocial,
  GuestSocialId,
  MailchimpCapability,
  NewsletterPreview,
  HomepageWeeklyEpisodesSettings,
  ShowId,
} from '@/lib';

export interface EpisodeDraft {
  readonly id?: EpisodeId;
  readonly title: string;
  readonly showId: ShowId;
  readonly episodeNumber: number | null;
  readonly durationMinutes: number | null;
  readonly notes: string;
  readonly premium: boolean;
  readonly scheduledAt?: string;
  readonly audioFile?: File;
}

export interface StudioDataContextValue {
  readonly data: AdminStudioContentData;
  readonly repositoryKind: AdminRepositoryKind;
  readonly capabilities: AdminRepositoryCapabilities;
  readonly isMutating: boolean;
  readonly lastError: Error | null;
  clearLastError(): void;
  createShow(command: CreateShowCommand): Promise<ShowId>;
  updateHomepageWeeklyEpisodesSettings(
    command: UpdateHomepageWeeklyEpisodesSettingsCommand,
  ): Promise<HomepageWeeklyEpisodesSettings>;
  createArticle(command: CreateArticleCommand): Promise<ArticleId>;
  updateArticle(id: ArticleId, command: UpdateArticleCommand): Promise<Article>;
  transitionEpisodeStatus(
    id: EpisodeId,
    status: EpisodeStatus,
    scheduledAt?: string,
  ): Promise<void>;
  saveEpisode(draft: EpisodeDraft, status: EpisodeStatus): Promise<EpisodeId>;
  transitionArticleStatus(
    id: ArticleId,
    status: ArticleStatus,
    expectedVersion: number,
  ): Promise<Article>;
  getMailchimpCapability(): Promise<MailchimpCapability>;
  previewArticleNewsletter(id: ArticleId): Promise<NewsletterPreview>;
  syncArticleNewsletterCampaign(
    id: ArticleId,
    expectedVersion: number,
  ): Promise<AdminNewsletterCampaignResult>;
  sendArticleNewsletter(
    id: ArticleId,
    audienceConfirmationToken: string,
    expectedVersion: number,
    expectedCampaignId: string,
  ): Promise<AdminNewsletterSendResult>;
  reconcileArticleNewsletter(id: ArticleId): Promise<AdminNewsletterSendResult>;
  listArticleMedia(): Promise<ArticleMediaAsset[]>;
  listArticleAuthors(): Promise<ArticleAuthorCandidate[]>;
  uploadArticleImage(command: UploadArticleImageCommand): Promise<ArticleMediaAsset>;
  createGuest(command: CreateGuestCommand): Promise<GuestId>;
  updateGuest(
    id: GuestId,
    patch: Partial<Pick<Guest, 'name' | 'role' | 'bio' | 'email' | 'city'>>,
  ): Promise<void>;
  addGuestSocial(guestId: GuestId): Promise<GuestSocialId>;
  updateGuestSocial(
    id: GuestSocialId,
    patch: Partial<Pick<GuestSocial, 'platform' | 'handle'>>,
  ): Promise<void>;
  removeGuestSocial(id: GuestSocialId): Promise<void>;
  addGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<void>;
  removeGuestAppearance(guestId: GuestId, episodeId: EpisodeId): Promise<void>;
}

export const StudioDataContext = createContext<StudioDataContextValue | null>(null);

export function useStudioData(): StudioDataContextValue {
  const context = useContext(StudioDataContext);
  if (!context) throw new Error('useStudioData must be used inside StudioDataProvider.');
  return context;
}
