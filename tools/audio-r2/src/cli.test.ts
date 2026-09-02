import { describe, expect, it } from 'vitest';
import {
  APPROVED_CLOUDFLARE_ACCOUNT_ID,
  APPROVED_R2_BUCKET,
  APPROVED_SUPABASE_PROJECT_REF,
} from './core.ts';
import { parseArguments } from './cli.ts';

describe('audio R2 CLI guards', () => {
  it('defaults to dry-run on the approved development targets', () => {
    const options = parseArguments([]);
    expect(options.apply).toBe(false);
    expect(options.accountId).toBe(APPROVED_CLOUDFLARE_ACCOUNT_ID);
    expect(options.bucket).toBe(APPROVED_R2_BUCKET);
    expect(options.expectedProjectRef).toBe(APPROVED_SUPABASE_PROJECT_REF);
  });

  it('rejects any different Cloudflare, R2, or Supabase target', () => {
    expect(() => parseArguments(['--account-id', '0'.repeat(32)])).toThrow(/Cloudflare account/);
    expect(() => parseArguments(['--bucket', 'production-audio'])).toThrow(/R2 bucket/);
    expect(() => parseArguments(['--project-ref', 'other'])).toThrow(/Supabase project/);
  });
});
