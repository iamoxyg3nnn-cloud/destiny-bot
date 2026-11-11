import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth';

/**
 * Gate every admin route behind a valid session cookie.
 *
 * The admin API exposes destructive operations and private data, so the
 * whole console must be authenticated — including the /api proxy.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public endpoints: login page and auth handshake.
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
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

    // Keep this relative: Cloudflare/other reverse proxies may expose the
    // origin to Next.js as localhost, and an absolute redirect could leak it.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: '/login' },
    });
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
