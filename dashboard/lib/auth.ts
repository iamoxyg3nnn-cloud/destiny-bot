/**
 * Dashboard session helpers.
 *
 * These run in BOTH the Node.js runtime (route handlers) and the Edge runtime
 * (middleware), so we deliberately use only Web Crypto (`globalThis.crypto`)
 * which is available in Node 18+ and in the Edge runtime alike.
 */

export const SESSION_COOKIE = 'destiny_admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64url(new Uint8Array(signature));
}

function sessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET || process.env.NEXTAUTH_SECRET || '';
  if (secret.length < 32 || /^(change_me|replace_with|your_)/i.test(secret) || secret === 'destiny_dashboard_secret_key_32bytes!') return '';
  return secret;
}

/**
 * Compare fixed-size SHA-256 digests without an early-exit byte comparison.
 * This avoids collisions from lossy shortcuts and keeps the final comparison
 * independent of the original string lengths.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let difference = 0;
  for (let i = 0; i < bytesA.length; i++) difference |= bytesA[i] ^ bytesB[i];
  return difference === 0;
}

export interface SessionPayload {
  /** Absolute expiry, ms since epoch. */
  exp: number;
  /** Issued-at, ms since epoch. */
  iat: number;
}

/**
 * Creates a signed, tamper-evident session token.
 * Format: <base64url(payload)>.<base64url(hmac)>
 */
export async function createSessionToken(ttlSeconds: number = SESSION_TTL_SECONDS): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;

  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > SESSION_TTL_SECONDS) return null;

  const now = Date.now();
  const payload: SessionPayload = { iat: now, exp: now + ttlSeconds * 1000 };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256(encoded, secret);
  return `${encoded}.${signature}`;
}

/**
 * Verifies a session token: signature must match and the session must not
 * have expired. Fails closed when no secret is configured.
 */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !token || token.length > 4096) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encoded, signature] = parts;
  const expected = await hmacSha256(encoded, secret);
  if (!(await safeEqual(signature, expected))) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(encoded))) as SessionPayload;
    const now = Date.now();
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) return false;
    if (payload.iat > now + 60_000 || payload.exp <= now || payload.exp <= payload.iat) return false;
    if (payload.exp - payload.iat > SESSION_TTL_SECONDS * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks the supplied admin password against the configured one.
 * Returns false when no password is configured so we never fail open.
 */
export async function verifyAdminPassword(candidate: unknown): Promise<boolean> {
  const expected = process.env.DASHBOARD_ADMIN_PASSWORD || '';
  if (expected.length < 12 || /^(admin|password|change_me|replace_with|your_)/i.test(expected)) return false;
  if (typeof candidate !== 'string' || !candidate || candidate.length > 1024) return false;
  return safeEqual(candidate, expected);
}
