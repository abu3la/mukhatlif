import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerLibraryDocument } from '@mukhtalif/types';
import { createSupabaseCustomerRepository } from './customer-supabase';
import { emptyCustomerLibrary } from './customer';

type Row = { user_id: string; document: CustomerLibraryDocument; revision: number };
type Result = { data: unknown; error: null | { code: string } };

/** Executable PostgREST-shaped fixture: observes predicates and concurrent writers. */
function storage(options: { collision?: 'insert' | 'update' | 'always'; existing?: boolean } = {}) {
  const rows = new Map<string, Row>([
    [
      'other-user',
      {
        user_id: 'other-user',
        document: { ...emptyCustomerLibrary(), savedEpisodeIds: ['private'] },
        revision: 9,
      },
    ],
  ]);
  if (options.existing)
    rows.set('customer', { user_id: 'customer', document: emptyCustomerLibrary(), revision: 1 });
  const observed: { action: string; filters: Record<string, unknown> }[] = [];
  let collided = false;
  let rpc: { name: string; args: unknown } | undefined;
  const db = {
    rpc: async (name: string, args: unknown) => {
      rpc = { name, args };
      return { data: null, error: null };
    },
    from: (table: string) => {
      expect(table).toBe('customer_libraries');
      let action = 'read';
      let values: Partial<Row> = {};
      const filters: Record<string, unknown> = {};
      const execute = (): Result => {
        observed.push({ action, filters: { ...filters } });
        const userId = action === 'insert' ? values.user_id! : (filters.user_id as string);
        expect(userId).toBe('customer');
        const row = rows.get(userId);
        if (action === 'read') return { data: row ? structuredClone(row) : null, error: null };
        if (action === 'insert') {
          if (options.collision === 'insert' && !collided) {
            collided = true;
            rows.set(userId, {
              user_id: userId,
              document: { ...emptyCustomerLibrary(), savedEpisodeIds: ['concurrent'] },
              revision: 1,
            });
          }
          if (rows.has(userId)) return { data: null, error: { code: '23505' } };
          rows.set(userId, structuredClone(values as Row));
          return { data: null, error: null };
        }
        expect(action).toBe('update');
        expect(typeof filters.revision).toBe('number');
        if ((options.collision === 'update' && !collided) || options.collision === 'always') {
          collided = true;
          row!.revision++;
          row!.document.savedEpisodeIds = ['concurrent'];
        }
        if (!row || row.revision !== filters.revision) return { data: null, error: null };
        Object.assign(row, structuredClone(values));
        return { data: { revision: row.revision }, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        },
        update: (input: Partial<Row>) => {
          action = 'update';
          values = input;
          return builder;
        },
        insert: async (input: Row) => {
          action = 'insert';
          values = input;
          return execute();
        },
        maybeSingle: async () => execute(),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, rows, observed, rpc: () => rpc };
}

describe('Supabase customer library isolation and concurrency', () => {
  it.each(['insert', 'update'] as const)(
    'retries a concurrent %s without losing either save',
    async (collision) => {
      const fixture = storage({ collision, existing: collision === 'update' });
      const repo = createSupabaseCustomerRepository(fixture.db);
      await repo.mutateCustomerLibrary('customer', (document) => {
        if (!document.savedEpisodeIds.includes('requested'))
          document.savedEpisodeIds.push('requested');
      });
      expect(fixture.rows.get('customer')?.document.savedEpisodeIds).toEqual([
        'concurrent',
        'requested',
      ]);
      expect(fixture.rows.get('other-user')?.document.savedEpisodeIds).toEqual(['private']);
      expect(fixture.rows.get('other-user')?.revision).toBe(9);
      expect(
        fixture.observed
          .filter((item) => item.action === 'update')
          .every((item) => item.filters.user_id === 'customer'),
      ).toBe(true);
    },
  );

  it('fails bounded repeated conflicts without blindly overwriting another device', async () => {
    const fixture = storage({ collision: 'always', existing: true });
    const repo = createSupabaseCustomerRepository(fixture.db);
    await expect(
      repo.mutateCustomerLibrary('customer', (document) => {
        document.savedEpisodeIds.push('requested');
      }),
    ).rejects.toThrow('changed concurrently');
    expect(fixture.observed.filter((item) => item.action === 'update')).toHaveLength(6);
    expect(fixture.rows.get('customer')?.document.savedEpisodeIds).toEqual(['concurrent']);
  });

  it('validates limits before issuing a database mutation', async () => {
    const fixture = storage({ existing: true });
    const repo = createSupabaseCustomerRepository(fixture.db);
    await expect(
      repo.mutateCustomerLibrary('customer', (document) => {
        document.queueEpisodeIds = Array.from({ length: 201 }, (_, n) => `episode-${n}`);
      }),
    ).rejects.toThrow('Library limit reached');
    expect(fixture.observed.map((item) => item.action)).toEqual(['read']);
  });

  it('clears library domains through the single user-scoped transaction RPC', async () => {
    const fixture = storage();
    await createSupabaseCustomerRepository(fixture.db).clearCustomerLibrary('customer');
    expect(fixture.rpc()).toEqual({
      name: 'clear_customer_library',
      args: { p_user_id: 'customer' },
    });
  });
});
