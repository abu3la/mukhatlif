import { vi } from 'vitest';
import { emptyCustomerLibrary } from '../lib/customer-utils';
export const anonymousCustomerFixture = {
  user: null,
  profile: null,
  client: null,
  loading: false,
  error: null,
  notice: '',
  library: emptyCustomerLibrary(),
  config: { apiOrigin: '', supabaseUrl: '', supabaseAnonKey: '', googleEnabled: false },
  requireAccount: () => false,
  notify: vi.fn(),
  publicRead: vi.fn(),
  saveProgress: vi.fn(),
};
