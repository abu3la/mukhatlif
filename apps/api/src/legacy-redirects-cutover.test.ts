import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalLegacySourcePath } from './routes/redirects';

const root = fileURLToPath(new URL('../../../', import.meta.url).href);
const scriptPath = `${root}scripts/legacy-redirects-cutover.mjs`;
const sqlPath = `${root}apps/api/supabase/legacy-redirects-cutover.sql`;

const key = (path: string) => canonicalLegacySourcePath(path)!;

/** The table definition from migration 0016 and the 19 non-article rows production held on 14 November 2026. */
async function productionLikeTable() {
  const ddl = readFileSync(
    `${root}apps/api/supabase/migrations/0016_wordpress_legacy_import.sql`,
    'utf8',
  );
  const table = ddl.slice(
    ddl.indexOf('create table public.url_redirects'),
    ddl.indexOf('create index url_redirects_active_idx'),
  );
  const db = new PGlite();
  await db.exec(`create table public.legacy_import_records (id bigint primary key);\n${table}`);
  const existing: [string, string, number, string][] = [
    ['/استبيان-البودكاستات-المتوقفة/', '/podform/', 301, 'wordpress-redirection'],
    ['/نشرة-أميال/', '/amyalnl/', 301, 'wordpress-redirection'],
    ['/2441-2/', '/avnews/', 301, 'wordpress-redirection'],
    ['/form/', 'https://docs.google.com/forms/d/e/x/viewform', 301, 'wordpress-redirection'],
    ['/vennre/khaled-fitforgrowth/', 'https://bit.ly/4bmMS1H', 302, 'wordpress-redirection'],
    ...[
      'creating-innovators',
      'inspired',
      'so-good-they-cant-ignore-you',
      'قوة-الآن-the-power-of-now',
      'كتاب-استراتيجية-المحيط-الأزرق',
    ].map(
      (slug, i) =>
        [`/book/${slug}/`, `/books/legacy-book-${i}/`, 301, 'wordpress-canonical'] as [
          string,
          string,
          number,
          string,
        ],
    ),
    ...[
      'أحمد-عطار',
      'أحمد-نور',
      'عبدالرحمن-عثمان',
      'عبدالرحمن-معشي',
      'علاء-الدين-عثمان',
      'عماد-ناجي',
      'محمد-النعمان',
      'محمد-بازيد',
      'محمد-عبدالعزيز',
    ].map(
      (name, i) =>
        [
          `/team_member/${name}/`,
          `/people/legacy-team-member-${i}/`,
          301,
          'wordpress-canonical',
        ] as [string, string, number, string],
    ),
  ];
  for (const [source, destination, status, label] of existing) {
    await db.query(
      'insert into public.url_redirects (source_path, destination, status_code, source_label) values ($1, $2, $3, $4)',
      [key(source), destination, status, label],
    );
  }
  return db;
}

type Row = { source_path: string; destination: string; status_code: number; is_active: boolean };

// One in-memory database for the file, started once: booting PGlite takes a few
// seconds on CI, more than a single test's default limit (same as the other
// PGlite suites here).
let db: PGlite;
let rows: Row[] = [];
beforeAll(async () => {
  db = await productionLikeTable();
  const sql = readFileSync(sqlPath, 'utf8');
  await db.exec(sql);
  await db.exec(sql); // a second run must succeed and change nothing
  rows = (await db.query<Row>('select * from public.url_redirects')).rows;
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe('cutover redirect script', () => {
  it('is the current output of its generator', () => {
    const generated = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    expect(readFileSync(sqlPath, 'utf8')).toBe(generated);
  });

  it('applies cleanly twice and leaves no old address pointing at a missing page', () => {
    const find = (path: string) => rows.find((row) => row.source_path === key(path));

    expect(rows).toHaveLength(19 + 44);
    expect(rows.filter((row) => !row.is_active).map((row) => row.source_path)).toEqual(
      expect.arrayContaining([key('/2441-2/'), key('/استبيان-البودكاستات-المتوقفة/')]),
    );
    const live = rows.filter((row) => row.is_active);
    expect(live.filter((row) => /^\/(books|people)\//.test(row.destination))).toEqual([]);
    expect(
      live.filter((row) => ['/amyalnl/', '/podform/', '/avnews/'].includes(row.destination)),
    ).toEqual([]);

    expect(find('/petroly/')).toMatchObject({ destination: '/shows/petroly', status_code: 301 });
    expect(find('/َqadiyahpod/')).toMatchObject({ destination: '/shows/qadiyah' });
    expect(find('/vennre/')).toMatchObject({ status_code: 302 });
    expect(find('/vennre/')!.destination.startsWith('https://vennre.com/')).toBe(true);
    expect(find('/vennre/khaled-fitforgrowth/')).toMatchObject({
      destination: 'https://bit.ly/4bmMS1H',
    });
    expect(find('/من-نحن/')).toMatchObject({ destination: '/about' });
    expect(find('/@fatima')).toMatchObject({ destination: '/articles' });
    expect(find('/team_member/محمد-بازيد/')).toMatchObject({ destination: '/about' });
    expect(find('/نشرة-أميال/')).toMatchObject({ destination: '/', status_code: 302 });
  });

  it('keys every row exactly the way the site looks a path up', () => {
    for (const row of rows) expect(key(row.source_path)).toBe(row.source_path);
  });
});
