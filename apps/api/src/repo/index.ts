import type { Env } from '../env';
import { createMemoryRepository } from './memory';
import { createSupabaseRepository } from './supabase';
import type { Repository } from './types';

let memory: Repository | null = null;

export function getRepository(env: Env): Repository {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  // Dev fallback: no credentials yet, serve the seeded in-memory dataset.
  memory ??= createMemoryRepository();
  return memory;
}

export type { Repository, EpisodeFilter, ArticleFilter } from './types';
