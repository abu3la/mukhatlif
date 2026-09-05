import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { atomicJson, linkVerified, validateReport } from './apply-cli.ts';
import {
  APPROVED_SUPABASE_PROJECT_REF,
  APPROVED_CLOUDFLARE_ACCOUNT_ID,
  APPROVED_R2_BUCKET,
} from './core.ts';
import type { TransferState } from './transfer.ts';

// This command never writes the concurrently-running transfer checkpoint.
const [reportFile, checkpointFile, envFile, output] = process.argv.slice(2);
if (
  !reportFile ||
  !checkpointFile ||
  !envFile ||
  !output ||
  !path.isAbsolute(output) ||
  output.includes('/mukhatlif/')
)
  throw new Error('Provide report, checkpoint, private development env, private link report');
if ((await stat(envFile)).mode & 0o077) throw new Error('Credentials must be mode 600');
const env = Object.fromEntries(
  Object.entries(parseEnv(await readFile(envFile, 'utf8'))).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
if (env.SUPABASE_URL !== `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`)
  throw new Error('Development project mismatch');
const reportText = await readFile(reportFile, 'utf8');
const checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8')) as {
  reportSha256: string;
  accountId: string;
  bucket: string;
  states: Record<string, TransferState>;
};
if (
  checkpoint.accountId !== APPROVED_CLOUDFLARE_ACCOUNT_ID ||
  checkpoint.bucket !== APPROVED_R2_BUCKET
)
  throw new Error('Checkpoint destination mismatch');
const items = validateReport(
  JSON.parse(reportText),
  createHash('sha256').update(reportText).digest('hex'),
  checkpoint.reportSha256,
);
const linked = {
  projectRef: APPROVED_SUPABASE_PROJECT_REF,
  transferReportSha256: checkpoint.reportSha256,
  generatedAt: new Date().toISOString(),
  episodeIds: [] as string[],
};
// A unique report per invocation avoids overwriting evidence from earlier passes.
await writeFile(output, JSON.stringify(linked), { mode: 0o600, flag: 'wx' });
for (const item of items) {
  if (!checkpoint.states[item.databaseEpisodeId!]?.verifiedAt) continue;
  await linkVerified(
    item,
    env,
    path.join(path.dirname(output), `${item.sourceUrlSha256}.before.json`),
  );
  linked.episodeIds.push(item.databaseEpisodeId!);
  await atomicJson(output, linked);
}
process.stdout.write(`Development audio links verified: ${linked.episodeIds.length}\n`);
