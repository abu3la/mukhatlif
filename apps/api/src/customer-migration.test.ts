import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/0024_customer_accounts_library.sql', import.meta.url),
  'utf8',
);

describe('customer migration authorization boundaries', () => {
  it('denies direct browser access to private profile and library tables', () => {
    for (const table of ['customer_profiles', 'customer_libraries']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain('from public, anon, authenticated, service_role');
    expect(migration).not.toMatch(/create\s+policy/i);
    expect(migration).toContain('references public.users(id) on delete cascade');
  });

  it('grants the narrowly scoped mutation functions only to the API service role', () => {
    for (const signature of [
      'provision_customer_account(uuid,text,text,text)',
      'update_customer_profile(text,jsonb)',
      'clear_customer_library(text)',
    ]) {
      expect(migration).toContain(
        `revoke all on function public.${signature} from public, anon, authenticated`,
      );
      expect(migration).toContain(`grant execute on function public.${signature} to service_role`);
    }
    expect(migration).not.toMatch(
      /(?:insert into|update|delete from)\s+public\.(?:studio_members|studio_roles|role_permissions)/i,
    );
  });

  it('requires a confirmed immutable Auth identity and guards against clear-library revision reuse', () => {
    expect(migration).toContain('where id = p_auth_user_id and email_confirmed_at is not null');
    expect(migration).toContain('where auth_user_id = p_auth_user_id');
    expect(migration).toContain('revision = customer_libraries.revision + 1');
    expect(migration).toContain('delete from public.follows where user_id = p_user_id');
    expect(migration).toContain('delete from public.playback_progress where user_id = p_user_id');
  });
});
