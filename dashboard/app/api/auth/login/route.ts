import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifyAdminPassword,
} from '../../../../lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = body?.password;

  if (!verifyAdminPassword(password)) {
    return NextResponse.json(
      { error: 'Invalid admin password.' },
      { status: 401 }
    );
  }

  const token = await createSessionToken(SESSION_TTL_SECONDS);
  if (!token) {
    return NextResponse.json(
      { error: 'Admin access is not configured on this deployment.' },
      { status: 503 }
    );
  }

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
