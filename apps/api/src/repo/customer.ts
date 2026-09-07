import type { CustomerLibraryDocument, CustomerProfile } from '@mukhtalif/types';
import type { ProvisionCustomerInput, UpdateCustomerProfileInput } from '@mukhtalif/validation';

export class CustomerConflictError extends Error {}
export class CustomerLibraryLimitError extends Error {}
export class CustomerItemNotFoundError extends Error {}

export interface CustomerRepository {
  /** Identity and email must come from the verified Auth response, never request JSON. */
  provisionCustomer(
    authUserId: string,
    email: string,
    input: ProvisionCustomerInput,
  ): Promise<CustomerProfile>;
  getCustomerProfile(userId: string): Promise<CustomerProfile | null>;
  updateCustomerProfile(
    userId: string,
    input: UpdateCustomerProfileInput,
  ): Promise<CustomerProfile | null>;
  getCustomerLibraryDocument(userId: string): Promise<CustomerLibraryDocument>;
  /** A mutation is retried against the latest document when another device writes concurrently. */
  mutateCustomerLibrary(
    userId: string,
    mutation: (document: CustomerLibraryDocument) => void,
  ): Promise<void>;
  clearCustomerLibrary(userId: string): Promise<void>;
  deleteProgress(userId: string, episodeId?: string): Promise<void>;
}

export function emptyCustomerLibrary(): CustomerLibraryDocument {
  return {
    savedEpisodeIds: [],
    savedArticleIds: [],
    playlists: [],
    bookmarks: [],
    queueEpisodeIds: [],
  };
}

export function defaultCustomerDetails() {
  return { gender: null, birthDate: null, interests: [], onboarded: false };
}
