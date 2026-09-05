import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Discovery only. Search results never authorize a database link; retrieve and
// verify full metadata from an approved publisher channel before matching.
const [output, ...queries] = process.argv.slice(2);
if (
  !output ||
  !path.isAbsolute(output) ||
  output.includes('/mukhatlif/') ||
  !queries.length ||
  queries.length > 12 ||
  queries.some((q) => q.length > 200 || !q.trim())
)
  throw new Error('Provide a new private output path and 1-12 public episode search queries');
const results: unknown[] = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (cursor < queries.length) {
      const query = queries[cursor++]!;
      const result = await new Promise((resolve) => {
        const child = spawn(
          'yt-dlp',
          [
            '--flat-playlist',
            '--skip-download',
            '--dump-single-json',
            '--no-warnings',
            '--socket-timeout',
            '20',
            '--retries',
            '1',
            `ytsearch5:${query}`,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let json = '';
        let bytes = 0;
        const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
        child.stdout.on('data', (b: Buffer) => {
          bytes += b.length;
          if (bytes > 2 * 1024 ** 2) child.kill('SIGTERM');
          else json += b.toString();
        });
        child.stderr.resume();
        child.on('error', () => {
          clearTimeout(timer);
          resolve({ query, error: 'Search process unavailable' });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          try {
            if (code !== 0) throw new Error();
            resolve({ query, entries: JSON.parse(json).entries });
          } catch {
            resolve({ query, error: 'Public metadata unavailable' });
          }
        });
      });
      results.push(result);
    }
  }),
);
await writeFile(output, JSON.stringify({ fetchedAt: new Date().toISOString(), results }, null, 2), {
  mode: 0o600,
  flag: 'wx',
});
process.stdout.write(`Saved ${results.length} discovery queries, no media downloaded.\n`);
