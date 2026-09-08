import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerProfile } from '@mukhtalif/types';
import { customerLibraryDocumentSchema } from '@mukhtalif/validation';
import {
  CustomerConflictError,
  CustomerLibraryLimitError,
  defaultCustomerDetails,
  emptyCustomerLibrary,
  type CustomerRepository,
} from './customer';

const USER_FIELDS = 'id,email,display_name,locale,created_at';

export function createSupabaseCustomerRepository(db: SupabaseClient): CustomerRepository {
  async function getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
    const [userResult, detailResult] = await Promise.all([
      db.from('users').select(USER_FIELDS).eq('id', userId).maybeSingle(),
      db
        .from('customer_profiles')
        .select('gender,birth_date,interests,onboarded')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (userResult.error) throw userResult.error;
    if (detailResult.error) throw detailResult.error;
    if (!userResult.data) return null;
    const user = userResult.data;
    const detail = detailResult.data;
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      locale: user.locale,
      createdAt: user.created_at,
      ...(detail
        ? {
            gender: detail.gender,
            birthDate: detail.birth_date,
            interests: detail.interests,
            onboarded: detail.onboarded,
          }
        : defaultCustomerDetails()),
    };
  }

  async function readDocument(userId: string) {
    const { data, error } = await db
      .from('customer_libraries')
      .select('document,revision')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          document: customerLibraryDocumentSchema.parse(data.document),
          revision: data.revision as number,
        }
      : null;
  }

  return {
    async isCustomerSchemaReady() {
      const migration = '0024_customer_accounts_library.sql';
      const signal = AbortSignal.timeout(5_000);
      try {
        const ledger = await db
          .from('schema_migrations')
          .select('filename')
          .eq('filename', migration)
          .retry(false)
          .abortSignal(signal)
          .maybeSingle();
        if (ledger.error || ledger.data?.filename !== migration) return false;
        // Selecting zero rows validates every required column without reading
        // profile details or library documents. Do not execute customer RPCs.
        const results = await Promise.all([
          db
            .from('customer_profiles')
            .select('user_id,gender,birth_date,interests,onboarded,updated_at')
            .limit(0)
            .retry(false)
            .abortSignal(signal),
          db
            .from('customer_libraries')
            .select('user_id,document,revision,updated_at')
            .limit(0)
            .retry(false)
            .abortSignal(signal),
        ]);
        return results.every((result) => !result.error);
      } catch {
        return false;
      }
    },
    getCustomerProfile,
    async provisionCustomer(authUserId, email, input) {
      const { data, error } = await db.rpc('provision_customer_account', {
        p_auth_user_id: authUserId,
        p_email: email,
        p_display_name: input.displayName,
        p_locale: input.locale,
      });
      if (error?.code === '23505') throw new CustomerConflictError('Account identity conflict');
      if (error) throw error;
      const profile = await getCustomerProfile(data as string);
      if (!profile) throw new Error('Provisioned customer profile is missing');
      return profile;
    },
    async updateCustomerProfile(userId, input) {
      // The RPC changes the name and private details in one transaction.
      const { error } = await db.rpc('update_customer_profile', {
        p_user_id: userId,
        p_changes: input,
      });
      if (error) throw error;
      return getCustomerProfile(userId);
    },
    async getCustomerLibraryDocument(userId) {
      return (await readDocument(userId))?.document ?? emptyCustomerLibrary();
    },
    async mutateCustomerLibrary(userId, mutation) {
      // The user_id predicate is present on every read/write. The revision
      // predicate prevents one device overwriting a concurrent save on another.
      for (let attempt = 0; attempt < 6; attempt++) {
        const current = await readDocument(userId);
        const document = current?.document ?? emptyCustomerLibrary();
        mutation(document);
        if (!customerLibraryDocumentSchema.safeParse(document).success) {
          throw new CustomerLibraryLimitError('Library limit reached');
        }
        if (!current) {
          const { error } = await db
            .from('customer_libraries')
            .insert({ user_id: userId, document, revision: 1 });
          if (!error) return;
          if (error.code === '23505') continue;
          throw error;
        }
        const { data, error } = await db
          .from('customer_libraries')
          .update({
            document,
            revision: current.revision + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('revision', current.revision)
          .select('revision')
          .maybeSingle();
        if (error) throw error;
        if (data) return;
      }
      throw new CustomerConflictError('The library changed concurrently; retry this change');
    },
    async deleteProgress(userId, episodeId) {
      let query = db.from('playback_progress').delete().eq('user_id', userId);
      if (episodeId) query = query.eq('episode_id', episodeId);
      const { error } = await query;
      if (error) throw error;
    },
    async clearCustomerLibrary(userId) {
      const { error } = await db.rpc('clear_customer_library', { p_user_id: userId });
      if (error) throw error;
    },
  };
}
