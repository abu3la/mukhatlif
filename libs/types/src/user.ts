export const USER_ROLES = ['listener', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type UserLocale = 'ar' | 'en';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  locale: UserLocale;
  /** ISO timestamp */
  createdAt: string;
}
