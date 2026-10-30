import { PERMISSION_IDS } from '@mukhtalif/types';
import { describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { createSupabaseRepository } from './supabase';

type Row = Record<string, unknown>;

/** Resolves like a PostgREST query: every builder call returns the query itself. */
function fakeQuery(rows: Row[]) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    then: (resolve: (value: { data: Row[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return query;
}

const role = (id: string, isProtected: boolean) => ({
  id,
  name: id,
  description: '',
  is_system: true,
  is_protected: isProtected,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function repositoryWith(tables: Record<string, Row[]>) {
  const from = vi.fn((table: string) => fakeQuery(tables[table] ?? []));
  createClientMock.mockReturnValue({ from });
  return { repository: createSupabaseRepository('https://example.supabase.co', 'key'), from };
}

describe('protected role permissions', () => {
  it('stays complete when stored rows predate a newer permission', async () => {
    const { repository, from } = repositoryWith({});

    await expect(repository.resolveRolePermissions('admin')).resolves.toEqual([...PERMISSION_IDS]);
    expect(from).not.toHaveBeenCalled();
  });

  it('reports the protected role as complete and other roles from stored rows', async () => {
    const { repository } = repositoryWith({
      studio_roles: [role('admin', true), role('editor', false)],
      role_permissions: [
        { role: 'admin', permission: 'overview.view' },
        { role: 'editor', permission: 'articles.view' },
      ],
    });

    const roles = await repository.listRoles();
    expect(roles.find(({ id }) => id === 'admin')?.permissions).toEqual([...PERMISSION_IDS]);
    expect(roles.find(({ id }) => id === 'editor')?.permissions).toEqual(['articles.view']);
  });

  it('still rejects an unknown permission on a custom role', async () => {
    const { repository } = repositoryWith({
      role_permissions: [{ role: 'editor', permission: 'unknown.view' }],
    });

    await expect(repository.resolveRolePermissions('editor')).rejects.toThrow(
      'invalid permission ID',
    );
  });
});
