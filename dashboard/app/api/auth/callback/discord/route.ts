import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  safeEqual,
} from '../../../../../lib/auth';

const STATE_COOKIE = 'destiny_discord_oauth_state';

function redirectToLogin(error: string): NextResponse {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const url = new URL('/login', base);
  url.searchParams.set('error', error);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/callback/discord',
    maxAge: 0,
  });
  return response;
}

function configuredOwnerIds(): Set<string> {
  return new Set((process.env.BOT_OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9]{17,20}$/.test(id)));
}

function callbackUri(): string {
  return new URL('/api/auth/callback/discord', process.env.NEXTAUTH_URL || 'http://localhost:3000').toString();
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || '';
  const state = req.nextUrl.searchParams.get('state') || '';
  const storedState = req.cookies.get(STATE_COOKIE)?.value || '';
  if (!code || !state || !storedState || !(await safeEqual(state, storedState))) {
    return redirectToLogin('oauth_state');
  }

  const clientId = process.env.DISCORD_CLIENT_ID || '';
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return redirectToLogin('oauth_config');

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUri(),
      }),
      cache: 'no-store',
    });
    if (!tokenResponse.ok) return redirectToLogin('oauth_exchange');
    const tokenData = await tokenResponse.json() as { access_token?: string; token_type?: string };
    if (!tokenData.access_token || tokenData.token_type?.toLowerCase() !== 'bearer') {
      return redirectToLogin('oauth_exchange');
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
      cache: 'no-store',
    });
    if (!userResponse.ok) return redirectToLogin('oauth_identity');
    const discordUser = await userResponse.json() as { id?: string };
    if (!discordUser.id || !configuredOwnerIds().has(discordUser.id)) {
      return redirectToLogin('not_owner');
    }

    const session = await createSessionToken(SESSION_TTL_SECONDS, discordUser.id);
    if (!session) return redirectToLogin('session_config');

    const response = NextResponse.redirect(new URL('/', process.env.NEXTAUTH_URL || 'http://localhost:3000'));
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    response.cookies.set(STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth/callback/discord',
      maxAge: 0,
    });
    return response;
  } catch (error: any) {
    console.error('[Dashboard Auth] Discord OAuth callback failed:', error?.message || error);
    return redirectToLogin('oauth_failed');
  }
}
