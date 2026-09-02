import { createHash } from 'node:crypto';

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`)
    .join(',')}}`;
}

export function checksumObject(value: unknown): string {
  return sha256(stableStringify(value));
}

export function omitChecksum<T extends { checksumSha256: string }>(
  value: T,
): Omit<T, 'checksumSha256'> {
  const copy: Partial<T> = { ...value };
  delete copy.checksumSha256;
  return copy as Omit<T, 'checksumSha256'>;
}
