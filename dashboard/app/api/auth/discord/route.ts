import { NextRequest, NextResponse } from 'next/server';

const STATE_COOKIE = 'destiny_discord_oauth_state';

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return new URL('/api/auth/callback/discord', base).toString();
}

export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID || '';
  const owners = (process.env.BOT_OWNER_IDS || '').split(',').map((id) => id.trim()).filter((id) => /^[0-9]{17,20}$/.test(id));
  const publicOrigin = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000');
  if (!clientId || !process.env.DISCORD_CLIENT_SECRET || owners.length === 0 ||
      (process.env.NODE_ENV === 'production' && publicOrigin.protocol !== 'https:')) {
    return NextResponse.json({ error: 'Discord owner sign-in requires BOT_OWNER_IDS, Discord OAuth credentials and a public HTTPS NEXTAUTH_URL in production.' }, { status: 503 });
  }

  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('state', state);

  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/callback/discord',
    maxAge: 300,
  });
  return response;
}
