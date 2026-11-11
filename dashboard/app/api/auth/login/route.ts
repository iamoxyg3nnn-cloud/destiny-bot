import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAdminPasswordConfigured,
  verifyAdminPassword,
} from '../../../../lib/auth';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(req: NextRequest): string {
  // Cloudflare supplies cf-connecting-ip at the edge. Do not trust arbitrary
  // X-Forwarded-For values: direct clients can spoof them to evade rate limits.
  const address = req.headers.get('cf-connecting-ip') || 'unknown';
  return address.slice(0, 128);
}

function consumeLoginAttempt(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (attempts.size > 10_000) {
    for (const [ip, record] of Array.from(attempts.entries())) {
      if (record.resetAt <= now) attempts.delete(ip);
    }
  }

  let record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    record = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) };
  }

  record.count += 1;
  attempts.set(key, record);
  return { allowed: true, retryAfter: 0 };
}

export async function POST(req: NextRequest) {
  // Report a broken deployment as a configuration error, not as a wrong
  // password. This is safe to expose: it never reveals the configured value.
  if (!isAdminPasswordConfigured()) {
    return NextResponse.json(
      { error: 'Admin password is not configured. Set a non-placeholder password of at least 12 characters.' },
      { status: 503 }
    );
  }

  const clientKey = getClientKey(req);
  const rate = consumeLoginAttempt(clientKey);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = body?.password;

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: 'Invalid admin password.' },
      { status: 401 }
    );
  }

  const token = await createSessionToken(SESSION_TTL_SECONDS);
  if (!token) {
    return NextResponse.json(
      { error: 'Admin session signing is not configured. Set DASHBOARD_SESSION_SECRET to a non-placeholder secret of at least 32 characters.' },
      { status: 503 }
    );
  }

  attempts.delete(clientKey);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
