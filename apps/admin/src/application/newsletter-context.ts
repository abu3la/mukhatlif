import { createContext, useContext } from 'react';
import type { AdminRepository } from '@/data';

export const NewsletterRepositoryContext = createContext<AdminRepository | null>(null);

export function useNewsletterRepository(): AdminRepository {
  const repository = useContext(NewsletterRepositoryContext);
  if (!repository) {
    throw new Error('useNewsletterRepository must be used inside NewsletterRouteLayout.');
  }
  return repository;
}
