import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../supabase/migrations/0022_homepage_weekly_episodes.sql',
  ),
  'utf8',
);

describe('homepage weekly episode settings migration contract', () => {
  it('creates one fixed seven-day setting with the approved default title', () => {
    expect(migration).toContain('create table public.homepage_weekly_episode_settings');
    expect(migration).toContain("title text not null default 'حلقات آخر أسبوع من مختلف'");
    expect(migration).toContain('check (id = 1)');
    expect(migration).toContain('check (window_days = 7)');
    expect(migration).toContain('check (version >= 1)');
    expect(migration).toContain('insert into public.homepage_weekly_episode_settings (id)');
  });

  it('keeps browser roles out and grants only the service role read and update access', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('from anon, authenticated, service_role');
    expect(migration).toContain('grant select, update on table public.homepage_weekly_episode_settings');
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(/grant\s+(?:insert|delete)/i);
    expect(migration.trim().endsWith('commit;')).toBe(true);
  });
});
