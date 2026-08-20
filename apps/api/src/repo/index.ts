import { ApiConfigurationError, getSupabaseCredentials, isDevAuthEnabled, type Env } from '../env';
import { createMemoryRepository } from './memory';
import { createSupabaseRepository } from './supabase';
import type { Repository } from './types';

let memory: Repository | null = null;

export function getRepository(env: Env): Repository {
  const supabase = getSupabaseCredentials(env);
  if (supabase) {
    return createSupabaseRepository(supabase.url, supabase.serviceRoleKey);
  }

  if (!isDevAuthEnabled(env)) {
    throw new ApiConfigurationError(
      'Supabase is not configured and local development authentication is disabled.',
    );
  }

  // The seeded repository is available only behind an explicit local-dev gate.
  memory ??= createMemoryRepository();
  return memory;
}

export type {
  Repository,
  EpisodeFilter,
  ArticleFilter,
  ChangeRolePermissionsResult,
  CreateRoleResult,
  ChangeStudioMemberRoleResult,
  InviteStudioMemberResult,
  NewsletterSendClaimResult,
  NewsletterSyncClaimResult,
  StoredMediaAsset,
  CreateMediaUploadRecordInput,
  CreateGuestSocialResult,
  LinkGuestAppearanceResult,
  MediaUploadClaim,
  UpdateGuestSocialResult,
} from './types';
