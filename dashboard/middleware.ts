import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth';

/**
 * Gate every admin route behind a valid session cookie.
 *
 * The admin API exposes destructive operations and private data, so the
 * whole console must be authenticated — including the /api proxy.
 */

/**
 * NextResponse.redirect requires an absolute URL. Behind Cloudflare Tunnel,
 * req.url can describe the loopback origin, so prefer proxy-supplied origin
 * headers when present to keep browser redirects on the public HTTPS host.
 *
 * This app is only exposed through the trusted Cloudflare tunnel and binds
 * its origin to loopback. Never accept arbitrary URL/path components here.
 */
function loginRedirectUrl(req: NextRequest): URL {
  const target = new URL('/login', req.url);

  const firstHeaderValue = (value: string | null) => value?.split(',')[0]?.trim() || '';
  const forwardedHost = firstHeaderValue(req.headers.get('x-forwarded-host'));
  let forwardedProto = firstHeaderValue(req.headers.get('x-forwarded-proto')).toLowerCase();

  if (forwardedProto !== 'https' && forwardedProto !== 'http') {
    try {
      const visitor = JSON.parse(req.headers.get('cf-visitor') || '{}');
      const scheme = typeof visitor.scheme === 'string' ? visitor.scheme.toLowerCase() : '';
      if (scheme === 'https' || scheme === 'http') forwardedProto = scheme;
    } catch {
      // Fall back to the protocol on req.url for non-Cloudflare/local requests.
    }
  }

  if (forwardedProto === 'https' || forwardedProto === 'http') {
    target.protocol = `${forwardedProto}:`;
  }

  if (forwardedHost) {
    try {
      // Parse as an authority, rejecting credentials and URL path injection.
      const authority = new URL(`${target.protocol}//${forwardedHost}`);
      if (!authority.username && !authority.password &&
          authority.pathname === '/' && !authority.search && !authority.hash) {
        target.host = authority.host;
      }
    } catch {
      // Ignore malformed proxy metadata and retain the request URL origin.
    }
  }

  target.pathname = '/login';
  target.search = '';
  target.hash = '';
  return target;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public endpoints: login page and auth handshake.
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout' ||
      pathname === '/api/auth/discord' || pathname === '/api/auth/callback/discord') {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let authenticated = false;

  // A malformed/stale cookie or a WebCrypto/runtime failure must never turn
  // an unauthenticated page request into an HTTP 500. Fail closed and send
  // the visitor back to the login page instead.
  try {
    authenticated = await verifySessionToken(token);
  } catch (error) {
    console.error('[Dashboard Auth] Session verification failed:', error);
    authenticated = false;
  }

  if (!authenticated) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.redirect(loginRedirectUrl(req), 307);
  }

  // SameSite cookies do not prevent requests from hostile sibling subdomains.
  // Require an exact same-origin Origin for every state-changing API request.
  const mutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (pathname.startsWith('/api/') && mutatingMethod) {
    const origin = req.headers.get('origin');
    if (!origin) {
      return NextResponse.json({ error: 'Forbidden: missing request origin.' }, { status: 403 });
    }

    try {
      const parsedOrigin = new URL(origin);
      const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
      if (!requestHost || parsedOrigin.host.toLowerCase() !== requestHost.toLowerCase() ||
          (process.env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:')) {
        return NextResponse.json({ error: 'Forbidden: cross-origin request.' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Forbidden: invalid request origin.' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - _next/static  (build output)
     * - _next/image   (image optimiser)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
