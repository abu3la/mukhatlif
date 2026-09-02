import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';

const NON_PUBLIC_IPS = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_IPS.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_IPS.addSubnet(network, prefix, 'ipv6');
}

export interface AudioHeadResult {
  status: 'verified' | 'mismatch' | 'error';
  httpStatus: number | null;
  finalUrl: string | null;
  finalHost: string | null;
  redirects: number;
  contentType: string | null;
  contentLength: number | null;
  acceptRanges: string | null;
  etag: string | null;
  lastModified: string | null;
  error: string | null;
}

function isPublicIp(value: string): boolean {
  const version = isIP(value);
  if (version === 4) return !NON_PUBLIC_IPS.check(value, 'ipv4');
  if (version === 6) return !NON_PUBLIC_IPS.check(value, 'ipv6');
  return false;
}

function safeHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Redirect is not a credential-free HTTPS URL without a fragment');
  }
  return url;
}

async function publicAddress(hostnameValue: string): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = hostnameValue.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Audio host is not public');
  }
  const literalVersion = isPublicIp(hostname) ? (hostname.includes(':') ? 6 : 4) : 0;
  if (literalVersion) return { address: hostname, family: literalVersion };
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicIp(entry.address))) {
    throw new Error('Audio host resolved to a non-public address');
  }
  const preferred = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  return { address: preferred.address, family: preferred.family as 4 | 6 };
}

interface HeadResponse {
  statusCode: number;
  location: string | null;
  contentType: string | null;
  contentLength: number | null;
  acceptRanges: string | null;
  etag: string | null;
  lastModified: string | null;
}

async function headOnce(url: URL): Promise<HeadResponse> {
  const pinned = await publicAddress(url.hostname);
  return await new Promise<HeadResponse>((resolve, reject) => {
    let settled = false;
    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const outgoing = request(
      {
        protocol: 'https:',
        hostname: pinned.address,
        family: pinned.family,
        port: url.port ? Number.parseInt(url.port, 10) : 443,
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        method: 'HEAD',
        headers: {
          host: url.host,
          accept: 'audio/mpeg,audio/mp4,audio/x-m4a,application/octet-stream;q=0.2',
          'accept-encoding': 'identity',
          'user-agent': 'Mukhtalif-Audio-R2-Preflight/1.0',
        },
      },
      (response) => {
        response.resume();
        if (settled) return;
        settled = true;
        const rawLength = response.headers['content-length'];
        const parsedLength =
          typeof rawLength === 'string' && /^\d+$/.test(rawLength) ? Number(rawLength) : null;
        const rawContentType = response.headers['content-type'];
        resolve({
          statusCode: response.statusCode ?? 0,
          location:
            typeof response.headers.location === 'string' ? response.headers.location : null,
          contentType:
            typeof rawContentType === 'string'
              ? (rawContentType.split(';')[0]?.trim().toLowerCase() ?? null)
              : null,
          contentLength: Number.isSafeInteger(parsedLength) ? parsedLength : null,
          acceptRanges:
            typeof response.headers['accept-ranges'] === 'string'
              ? response.headers['accept-ranges']
              : null,
          etag: typeof response.headers.etag === 'string' ? response.headers.etag : null,
          lastModified:
            typeof response.headers['last-modified'] === 'string'
              ? response.headers['last-modified']
              : null,
        });
      },
    );
    outgoing.setTimeout(25_000, () => outgoing.destroy(new Error('Audio HEAD timed out')));
    outgoing.on('error', finishReject);
    outgoing.end();
  });
}

function compatibleMime(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  // Old Anchor/CloudFront objects sometimes use the generic binary type even
  // though the feed and encoded filename both identify MP3. Apply still has to
  // inspect the downloaded file magic before upload; HEAD alone does not claim
  // those bytes are audio.
  if (actual === 'application/octet-stream') return true;
  const mp3 = new Set(['audio/mpeg', 'audio/mp3']);
  const m4a = new Set(['audio/mp4', 'audio/x-m4a']);
  if (mp3.has(expected)) return mp3.has(actual);
  if (m4a.has(expected)) return m4a.has(actual);
  return false;
}

export async function inspectAudioHead(input: {
  sourceUrl: string;
  expectedByteSize: number;
  expectedMimeType: string;
}): Promise<AudioHeadResult> {
  let current: URL;
  try {
    current = safeHttpsUrl(input.sourceUrl);
  } catch (error) {
    return {
      status: 'error',
      httpStatus: null,
      finalUrl: null,
      finalHost: null,
      redirects: 0,
      contentType: null,
      contentLength: null,
      acceptRanges: null,
      etag: null,
      lastModified: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    try {
      const result = await headOnce(current);
      if ([301, 302, 303, 307, 308].includes(result.statusCode)) {
        if (!result.location) throw new Error('Audio redirect has no Location header');
        current = safeHttpsUrl(new URL(result.location, current).toString());
        continue;
      }
      if (result.statusCode !== 200)
        throw new Error(`Audio source returned HTTP ${result.statusCode}`);
      const problems: string[] = [];
      if (result.contentLength !== input.expectedByteSize) {
        problems.push(
          `Content-Length ${String(result.contentLength)} does not match RSS ${input.expectedByteSize}`,
        );
      }
      if (!compatibleMime(input.expectedMimeType, result.contentType)) {
        problems.push(
          `Content-Type ${result.contentType ?? 'missing'} does not match ${input.expectedMimeType}`,
        );
      }
      return {
        status: problems.length === 0 ? 'verified' : 'mismatch',
        httpStatus: result.statusCode,
        finalUrl: current.toString(),
        finalHost: current.hostname.toLowerCase(),
        redirects,
        contentType: result.contentType,
        contentLength: result.contentLength,
        acceptRanges: result.acceptRanges,
        etag: result.etag,
        lastModified: result.lastModified,
        error: problems.length === 0 ? null : problems.join('; '),
      };
    } catch (error) {
      return {
        status: 'error',
        httpStatus: null,
        finalUrl: current.toString(),
        finalHost: current.hostname.toLowerCase(),
        redirects,
        contentType: null,
        contentLength: null,
        acceptRanges: null,
        etag: null,
        lastModified: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    status: 'error',
    httpStatus: null,
    finalUrl: current.toString(),
    finalHost: current.hostname.toLowerCase(),
    redirects: 6,
    contentType: null,
    contentLength: null,
    acceptRanges: null,
    etag: null,
    lastModified: null,
    error: 'Audio source exceeded five redirects',
  };
}

export async function mapConcurrent<Input, Output>(
  values: Input[],
  concurrency: number,
  task: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const output = new Array<Output>(values.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await task(values[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, values.length)) }, () => worker()),
  );
  return output;
}
