/** Reads the unverified role claim only to catch a key pasted into the wrong slot. */
function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** Returns public, secret, or null for both current and legacy Supabase keys. */
export function supabaseKeyKind(token) {
  const value = String(token ?? '').trim();
  if (!value) return null;
  if (value.startsWith('sb_publishable_')) return 'public';
  if (value.startsWith('sb_secret_')) return 'secret';
  const role = jwtRole(value);
  if (role === 'anon') return 'public';
  if (role === 'service_role') return 'secret';
  return null;
}

/** Returns the exact 20-character project ref for a standard Supabase origin. */
export function supabaseProjectRef(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
    if (
      !match ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return match[1];
  } catch {
    return null;
  }
}
