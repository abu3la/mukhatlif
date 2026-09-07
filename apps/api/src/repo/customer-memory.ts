import type {
  CustomerLibraryDocument,
  CustomerProfile,
  Follow,
  PlaybackProgress,
  User,
} from '@mukhtalif/types';
import { customerLibraryDocumentSchema } from '@mukhtalif/validation';
import {
  CustomerConflictError,
  CustomerLibraryLimitError,
  defaultCustomerDetails,
  emptyCustomerLibrary,
  type CustomerRepository,
} from './customer';

type MemoryUser = User & { authUserId: string | null };
const details = new Map<string, Omit<CustomerProfile, keyof User>>();
const libraries = new Map<string, CustomerLibraryDocument>();

/** Shares the existing app-user collection; Studio membership is never consulted or changed. */
export function createMemoryCustomerRepository(
  users: MemoryUser[],
  progress: PlaybackProgress[],
  follows: Follow[],
): CustomerRepository {
  const profile = (user: MemoryUser): CustomerProfile => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
    createdAt: user.createdAt,
    ...structuredClone(details.get(user.id) ?? defaultCustomerDetails()),
  });
  return {
    async provisionCustomer(authUserId, email, input) {
      const existing = users.find(
        (user) => user.authUserId === authUserId || `dev:${user.id}` === authUserId,
      );
      if (
        users.some((user) => user !== existing && user.email.toLowerCase() === email.toLowerCase())
      ) {
        throw new CustomerConflictError('An account with this email is already provisioned');
      }
      if (existing) {
        existing.email = email.trim().toLowerCase();
        return profile(existing);
      }
      const user: MemoryUser = {
        id: `usr-${crypto.randomUUID()}`,
        email: email.trim().toLowerCase(),
        authUserId,
        displayName: input.displayName,
        locale: input.locale,
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      return profile(user);
    },
    async getCustomerProfile(userId) {
      const user = users.find((candidate) => candidate.id === userId);
      return user ? profile(user) : null;
    },
    async updateCustomerProfile(userId, input) {
      const user = users.find((candidate) => candidate.id === userId);
      if (!user) return null;
      const { displayName, locale, ...changes } = input;
      if (displayName !== undefined) user.displayName = displayName;
      if (locale !== undefined) user.locale = locale;
      details.set(userId, {
        ...defaultCustomerDetails(),
        ...details.get(userId),
        ...structuredClone(changes),
      });
      return profile(user);
    },
    async getCustomerLibraryDocument(userId) {
      return structuredClone(libraries.get(userId) ?? emptyCustomerLibrary());
    },
    async mutateCustomerLibrary(userId, mutation) {
      const document = structuredClone(libraries.get(userId) ?? emptyCustomerLibrary());
      mutation(document);
      const result = customerLibraryDocumentSchema.safeParse(document);
      if (!result.success) throw new CustomerLibraryLimitError('Library limit reached');
      libraries.set(userId, result.data);
    },
    async deleteProgress(userId, episodeId) {
      for (let index = progress.length - 1; index >= 0; index--) {
        if (
          progress[index].userId === userId &&
          (!episodeId || progress[index].episodeId === episodeId)
        ) {
          progress.splice(index, 1);
        }
      }
    },
    async clearCustomerLibrary(userId) {
      libraries.set(userId, emptyCustomerLibrary());
      for (const entries of [progress, follows]) {
        for (let index = entries.length - 1; index >= 0; index--) {
          if (entries[index].userId === userId) entries.splice(index, 1);
        }
      }
    },
  };
}
