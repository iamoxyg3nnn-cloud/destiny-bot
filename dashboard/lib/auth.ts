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
  return secret;
}

/**
 * Constant-time string comparison that does not leak length via early exit.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  // Hash both sides so differing lengths still take the same work.
  return hashLength(bufA) === hashLength(bufB);
}

function hashLength(bytes: Uint8Array): number {
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc * 31 + bytes[i]) | 0;
  }
  return acc ^ bytes.length;
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
  if (!secret || !token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encoded, signature] = parts;
  const expected = await hmacSha256(encoded, secret);
  if (!safeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(encoded))) as SessionPayload;
    if (typeof payload.exp !== 'number') return false;
    return Date.now() < payload.exp;
  } catch {
    return false;
  }
}

/**
 * Checks the supplied admin password against the configured one.
 * Returns false when no password is configured so we never fail open.
 */
export function verifyAdminPassword(candidate: unknown): boolean {
  const expected = process.env.DASHBOARD_ADMIN_PASSWORD || '';
  if (!expected || typeof candidate !== 'string' || !candidate) return false;
  return safeEqual(candidate, expected);
}
