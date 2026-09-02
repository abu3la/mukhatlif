import { createContext, useContext } from 'react';
import type { AdminRepository } from '@/data';

export const FormSubmissionRepositoryContext =
  createContext<AdminRepository | null>(null);

export function useFormSubmissionRepository(): AdminRepository {
  const repository = useContext(FormSubmissionRepositoryContext);
  if (!repository) {
    throw new Error(
      'useFormSubmissionRepository must be used inside FormSubmissionRouteLayout.',
    );
  }
  return repository;
}
