import { afterEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { developmentConnection, main } from './migrate-customer-development.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const temporaryDirectories = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(spawnSync).mockReset();
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('customer development migration target guard', () => {
  it('accepts only exact development direct/session connections', () => {
    assert.equal(
      developmentConnection(
        'postgresql://postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres',
      ).PGHOST,
      'db.acomtixjibgkauzeltsn.supabase.co',
    );
    assert.equal(
      developmentConnection(
        'postgresql://postgres.acomtixjibgkauzeltsn:test@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require',
      ).PGUSER,
      'postgres.acomtixjibgkauzeltsn',
    );
  });
  it('accepts only the exact CLI login role with explicit opt-in and sets the effective role', () => {
    for (const url of [
      'postgresql://cli_login_postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres?sslmode=require',
      'postgresql://cli_login_postgres.acomtixjibgkauzeltsn:test@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',
    ]) {
      assert.throws(() => developmentConnection(url));
      const connection = developmentConnection(url, { cliLoginRole: true });
      assert.equal(connection.PGOPTIONS, '-c role=postgres');
      assert.equal(connection.PGPORT, '5432');
    }
    assert.equal(
      developmentConnection(
        'postgresql://postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres',
      ).PGOPTIONS,
      '',
    );
  });
  for (const url of [
    'postgresql://cli_login_postgres:test@db.pacpdxvujkjvnaeeuute.supabase.co/postgres',
    'postgresql://cli_login_postgres.pacpdxvujkjvnaeeuute:test@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    'postgresql://cli_login_postgres.otherproject:test@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    'postgresql://cli_login_postgres.acomtixjibgkauzeltsn:test@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    'postgresql://cli_login_postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres?sslmode=disable',
    'postgresql://cli_login_postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres?options=-c%20role%3Dservice_role',
    'postgresql://cli_login_postgres@db.acomtixjibgkauzeltsn.supabase.co/postgres',
    'postgresql://other_login:test@db.acomtixjibgkauzeltsn.supabase.co/postgres',
    'postgresql://postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres',
  ]) {
    it('keeps CLI opt-in restricted to its exact role, project and secure connection', () => {
      assert.throws(() => developmentConnection(url, { cliLoginRole: true }));
    });
  }
  for (const url of [
    'postgresql://postgres:test@db.pacpdxvujkjvnaeeuute.supabase.co/postgres',
    'postgresql://postgres.pacpdxvujkjvnaeeuute:test@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres.acomtixjibgkauzeltsn:test@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    'postgresql://postgres:test@db.acomtixjibgkauzeltsn.supabase.co/another',
    'postgresql://postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres?sslmode=disable',
    'postgresql://postgres:test@db.acomtixjibgkauzeltsn.supabase.co/postgres?options=unsafe',
    'postgresql://postgres.acomtixjibgkauzeltsn:test@attacker.example/postgres',
    'postgresql://postgres@db.acomtixjibgkauzeltsn.supabase.co/postgres',
  ]) {
    it('rejects an unapproved database target/configuration', () => {
      assert.throws(() => developmentConnection(url));
    });
  }
});

describe('CLI migration preflight', () => {
  function fixture(effectiveRole, sessionRole = 'cli_login_postgres') {
    const directory = mkdtempSync(join(tmpdir(), 'mukhtalif-cli-migration-test-'));
    temporaryDirectories.push(directory);
    const envFile = join(directory, 'fixture.env');
    writeFileSync(
      envFile,
      'MUKHTALIF_DEVELOPMENT_DB_URL=postgresql://cli_login_postgres:fixture-password@db.acomtixjibgkauzeltsn.supabase.co/postgres?sslmode=require\n',
      { mode: 0o600 },
    );
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        database: 'postgres',
        effectiveRole,
        sessionRole,
        ledger: ['0023_episode_youtube.sql'],
        tables: [],
        counts: { authUsers: 3, users: 2, studioMembers: 1 },
      }),
    });
    return { envFile, backup: join(directory, 'new-backup') };
  }

  it('rejects a connection that did not assume postgres before any backup or DDL', () => {
    const { envFile, backup } = fixture('cli_login_postgres');
    assert.throws(
      () => main(['--env-file', envFile, '--cli-login-role', '--backup-dir', backup, '--apply']),
      /effective postgres/,
    );
    assert.equal(vi.mocked(spawnSync).mock.calls.length, 1);
    assert.match(vi.mocked(spawnSync).mock.calls[0][0], /psql$/);
    assert.doesNotMatch(
      vi.mocked(spawnSync).mock.calls[0][2].input,
      /(?:insert into|create table|alter table)/i,
    );
  });

  it('rejects an unexpected session login even when the effective role is postgres', () => {
    const { envFile, backup } = fixture('postgres', 'other_login');
    assert.throws(
      () => main(['--env-file', envFile, '--cli-login-role', '--backup-dir', backup, '--apply']),
      /expected database login role/,
    );
    assert.equal(vi.mocked(spawnSync).mock.calls.length, 1);
  });

  it('passes only the verified connection to libpq and preserves Auth counts in preflight output', () => {
    const { envFile } = fixture('postgres');
    vi.stubEnv('PGHOSTADDR', '203.0.113.99');
    vi.stubEnv('PGSERVICE', 'unrelated-project');
    vi.stubEnv('PGOPTIONS', '-c role=service_role');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      main(['--env-file', envFile, '--cli-login-role']);
      const invocation = vi.mocked(spawnSync).mock.calls[0];
      assert.equal(invocation[2].env.PGOPTIONS, '-c role=postgres');
      assert.equal(invocation[2].env.PGHOSTADDR, undefined);
      assert.equal(invocation[2].env.PGSERVICE, undefined);
      assert.match(invocation[2].input, /current_user/);
      assert.match(invocation[2].input, /session_user/);
      assert.match(invocation[2].input, /count\(\*\) from auth\.users/);
      assert.equal(JSON.parse(log.mock.calls[0][0]).counts.authUsers, 3);
      assert(!log.mock.calls[0][0].includes('fixture-password'));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
