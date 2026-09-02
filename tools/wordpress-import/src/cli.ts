import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadWordPressMedia,
  mergeRestMedia,
  parseRestMediaManifest,
  pathExists,
  reconcileRestMedia,
} from './media.ts';
import { buildDryRunReport } from './report.ts';
import { parsePodcastRss } from './rss.ts';
import type {
  MediaDownloadReport,
  PodcastFeedManifest,
  WordPressRedirectionExport,
} from './types.ts';
import { addWordPressRedirectionExport, parseWordPressWxr } from './wordpress.ts';

interface CliOptions {
  wxr: string;
  outputDirectory: string | null;
  restMedia: string | null;
  redirection: string | null;
  downloadMedia: boolean;
  mediaConcurrency: number;
  rss: Array<{ showSlug: string; source: string }>;
}

const USAGE = `Usage:
  pnpm import:wordpress:dry-run -- --wxr /absolute/wordpress-all.xml [options]

Options:
  --output-dir /absolute/path        Output directory; defaults to the WXR directory
  --rest-media /absolute/file.json  REST media export; auto-detected under rest/media-all.json
  --redirection /absolute/file.json Redirection plugin export; auto-detected as redirection.json
  --rss show-slug=file-or-url        Include a podcast RSS feed; repeatable
  --download-media                   Download originals under output-dir/media/originals
  --media-concurrency 4              Parallel media downloads (1-12; default 4)
  --help                             Show this help
`;

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(args: string[]): CliOptions | null {
  const result: CliOptions = {
    wxr: '',
    outputDirectory: null,
    restMedia: null,
    redirection: null,
    downloadMedia: false,
    mediaConcurrency: 4,
    rss: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--') continue;
    if (flag === '--help') return null;
    if (flag === '--download-media') {
      result.downloadMedia = true;
      continue;
    }
    if (flag === '--wxr') result.wxr = requireValue(args, index++, flag);
    else if (flag === '--output-dir') result.outputDirectory = requireValue(args, index++, flag);
    else if (flag === '--rest-media') result.restMedia = requireValue(args, index++, flag);
    else if (flag === '--redirection') result.redirection = requireValue(args, index++, flag);
    else if (flag === '--media-concurrency') {
      result.mediaConcurrency = Number.parseInt(requireValue(args, index++, flag), 10);
    } else if (flag === '--rss') {
      const value = requireValue(args, index++, flag);
      const separator = value.indexOf('=');
      if (separator < 1) throw new Error('--rss must be show-slug=file-or-url');
      const showSlug = value.slice(0, separator);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(showSlug)) {
        throw new Error(`Invalid RSS show slug: ${showSlug}`);
      }
      result.rss.push({ showSlug, source: value.slice(separator + 1) });
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!result.wxr) throw new Error('--wxr is required');
  if (
    !Number.isInteger(result.mediaConcurrency) ||
    result.mediaConcurrency < 1 ||
    result.mediaConcurrency > 12
  ) {
    throw new Error('--media-concurrency must be an integer from 1 to 12');
  }
  return result;
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, filePath);
}

async function optionalJson<T>(filePath: string): Promise<T | null> {
  if (!(await pathExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function readXmlSource(source: string): Promise<string> {
  if (!/^https:\/\//.test(source)) return readFile(path.resolve(source), 'utf8');
  const url = new URL(source);
  if (url.username || url.password) throw new Error('RSS URLs cannot contain credentials');
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`RSS ${source} returned HTTP ${response.status}`);
  return response.text();
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    process.stdout.write(USAGE);
    return;
  }
  const wxrPath = path.resolve(options.wxr);
  const outputDirectory = path.resolve(options.outputDirectory ?? path.dirname(wxrPath));
  const xml = await readFile(wxrPath, 'utf8');
  const sourceChecksumSha256 = createHash('sha256').update(xml).digest('hex');
  let manifest = parseWordPressWxr(xml, { sourceFile: wxrPath, sourceChecksumSha256 });
  const inputChecksumsSha256: Record<string, string> = { wxr: sourceChecksumSha256 };

  const defaultRestMedia = path.join(outputDirectory, 'rest', 'media-all.json');
  const restMediaPath = options.restMedia ? path.resolve(options.restMedia) : defaultRestMedia;
  let mediaReconciliation = null;
  if (await pathExists(restMediaPath)) {
    const restMediaRaw = await readFile(restMediaPath, 'utf8');
    inputChecksumsSha256.restMedia = createHash('sha256').update(restMediaRaw).digest('hex');
    const restMedia = parseRestMediaManifest(JSON.parse(restMediaRaw));
    mediaReconciliation = reconcileRestMedia(manifest, restMedia);
    manifest = mergeRestMedia(manifest, restMedia);
  }

  const defaultRedirection = path.join(outputDirectory, 'redirection.json');
  const redirectionPath = options.redirection
    ? path.resolve(options.redirection)
    : defaultRedirection;
  if (await pathExists(redirectionPath)) {
    const redirectionRaw = await readFile(redirectionPath, 'utf8');
    inputChecksumsSha256.redirection = createHash('sha256').update(redirectionRaw).digest('hex');
    const redirection = JSON.parse(redirectionRaw) as WordPressRedirectionExport;
    manifest = addWordPressRedirectionExport(manifest, redirection);
  }

  const podcastFeeds: PodcastFeedManifest[] = [];
  for (const rss of options.rss) {
    const rssXml = await readXmlSource(rss.source);
    inputChecksumsSha256[`rss:${rss.showSlug}`] = createHash('sha256').update(rssXml).digest('hex');
    podcastFeeds.push(
      parsePodcastRss(rssXml, {
        showSlug: rss.showSlug,
        source: rss.source,
      }),
    );
  }

  const report = buildDryRunReport({
    manifest,
    mediaReconciliation,
    podcastFeeds,
    inputChecksumsSha256,
  });
  const manifestPath = path.join(outputDirectory, 'wordpress-manifest.json');
  const reportPath = path.join(outputDirectory, 'wordpress-dry-run-report.json');
  await atomicJson(manifestPath, manifest);
  await atomicJson(reportPath, report);
  if (podcastFeeds.length)
    await atomicJson(path.join(outputDirectory, 'podcast-rss-manifest.json'), podcastFeeds);

  if (options.downloadMedia) {
    const mediaReportPath = path.join(outputDirectory, 'media-download-report.json');
    const previousReport = await optionalJson<MediaDownloadReport>(mediaReportPath);
    const mediaReport = await downloadWordPressMedia({
      manifest,
      outputDirectory,
      previousReport,
      concurrency: options.mediaConcurrency,
    });
    await atomicJson(mediaReportPath, mediaReport);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        manifestPath,
        reportPath,
        sourceChecksumSha256,
        manifestChecksumSha256: manifest.checksumSha256,
        candidates: report.counts.candidates,
        authors: report.counts.authors,
        redirects: report.counts.proposedRedirects,
        issues: {
          errors: report.issues.filter((issue) => issue.level === 'error').length,
          warnings: report.issues.filter((issue) => issue.level === 'warning').length,
        },
      },
      null,
      2,
    )}\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
