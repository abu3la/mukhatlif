import { isIP } from 'node:net';

interface ProxyRequest {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string | null };
}

function normalizeAddress(input: string | null | undefined): string | null {
  let value = input?.trim().replace(/^"|"$/g, '');
  if (!value) return null;
  if (value.startsWith('[')) {
    const closing = value.indexOf(']');
    if (closing > 0) value = value.slice(1, closing);
  }
  const zone = value.indexOf('%');
  if (zone > 0) value = value.slice(0, zone);
  if (value.toLowerCase().startsWith('::ffff:')) {
    const mapped = value.slice(7);
    if (isIP(mapped) === 4) value = mapped;
  }
  return isIP(value) ? value.toLowerCase() : null;
}

/**
 * Resolves the address immediately before the configured trusted proxy hops.
 * The socket peer must exist; without it no forwarded header is trusted.
 */
export function resolveTrustedClientAddress(
  request: ProxyRequest,
  trustedProxyHops: number,
): string {
  const socketAddress = normalizeAddress(request.socket.remoteAddress);
  if (!socketAddress) return 'unknown';

  const raw = request.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(raw) ? raw.join(',') : raw ?? '')
    .split(',')
    .map(normalizeAddress)
    .filter((address): address is string => Boolean(address));
  const chain = [...forwarded, socketAddress];
  const clientIndex = chain.length - trustedProxyHops - 1;
  return clientIndex >= 0 ? chain[clientIndex]! : socketAddress;
}
