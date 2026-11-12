/**
 * Dashboard session helpers.
 *
 * These run in BOTH the Node.js runtime (route handlers) and the Edge runtime
 * and deliberately use only Web Crypto, available in Node 18+ and Edge.
 */

export const SESSION_COOKIE = 'destiny_admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const encoder = new TextEncoder();

// Reject known examples/placeholders, not broad prefixes. A legitimate strong
// passphrase beginning with "admin" must not be rejected for that prefix.
const UNSAFE_DEFAULT_SECRETS = new Set([
  'admin',
  'password',
  'change_me',
  'change-me',
  'changeme',
  'replace_with',
  'replace-with',
  'your_password',
  'your_admin_password',
  'your_secret',
  'your_session_secret',
  'destiny_dashboard_secret_key_32bytes!',
]);

function isUnsafeDefault(value: string): boolean {
  return UNSAFE_DEFAULT_SECRETS.has(value.trim().toLowerCase());
}

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
  if (secret.length < 32 || isUnsafeDefault(secret)) return '';
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
  /** Verified Discord user ID for an individually authenticated platform owner. */
  sub?: string;
  role?: 'owner';
}

/**
 * Creates a signed, tamper-evident session token.
 * Format: base64url(payload).base64url(hmac)
 */
export async function createSessionToken(ttlSeconds: number = SESSION_TTL_SECONDS, subject?: string): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;

  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > SESSION_TTL_SECONDS) return null;
  if (subject !== undefined && !/^[0-9]{17,20}$/.test(subject)) return null;

  const now = Date.now();
  const payload: SessionPayload = {
    iat: now,
    exp: now + ttlSeconds * 1000,
    ...(subject ? { sub: subject, role: 'owner' as const } : {}),
  };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256(encoded, secret);
  return `${encoded}.${signature}`;
}

/**
 * Verifies a session token: signature must match and the session must not
 * have expired. Fails closed when no secret is configured.
 */
export async function readSessionPayload(token: string | undefined | null): Promise<SessionPayload | null> {
  const secret = sessionSecret();
  if (!secret || !token || token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expected = await hmacSha256(encoded, secret);
  if (!(await safeEqual(signature, expected))) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(encoded))) as SessionPayload;
    const now = Date.now();
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) return null;
    if (payload.iat > now + 60_000 || payload.exp <= now || payload.exp <= payload.iat) return null;
    if (payload.exp - payload.iat > SESSION_TTL_SECONDS * 1000) return null;
    if (payload.sub !== undefined && (!/^[0-9]{17,20}$/.test(payload.sub) || payload.role !== 'owner')) return null;
    if (payload.sub === undefined && payload.role !== undefined) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await readSessionPayload(token)) !== null;
}

/**
 * Reports whether a usable admin password is configured. This lets the login
 * endpoint distinguish deployment misconfiguration (503) from a wrong
 * password (401) without exposing any secret material.
 */
export function isAdminPasswordConfigured(): boolean {
  const expected = process.env.DASHBOARD_ADMIN_PASSWORD || '';
  return expected.length >= 12 && !isUnsafeDefault(expected);
}

/**
 * Checks the supplied admin password against the configured one.
 * Returns false when no acceptable password is configured so we never fail open.
 */
export async function verifyAdminPassword(candidate: unknown): Promise<boolean> {
  const expected = process.env.DASHBOARD_ADMIN_PASSWORD || '';
  if (!isAdminPasswordConfigured()) return false;
  if (typeof candidate !== 'string' || !candidate || candidate.length > 1024) return false;
  return safeEqual(candidate, expected);
}
