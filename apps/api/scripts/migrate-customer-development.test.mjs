import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { developmentConnection } from './migrate-customer-development.mjs';

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
