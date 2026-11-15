import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, getAdminSecretKey, verifyAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const isAuthed = verifyAdminAuth(request);
  return NextResponse.json({ authenticated: isAuthed });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const key = body?.key?.trim();
    const expected = getAdminSecretKey();

    if (!key || key !== expected) {
      return NextResponse.json({ error: 'Invalid staff authentication key' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true, message: 'Authenticated successfully' });
    response.cookies.set(ADMIN_COOKIE_NAME, expected, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
