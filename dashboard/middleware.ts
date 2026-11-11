import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth';

/**
 * Gate every admin route behind a valid session cookie.
 *
 * The admin API exposes destructive operations (banning users, adjusting the
 * coin economy, terminating rooms) and private anonymous chat messages, so
 * the whole console must be authenticated — including the /api proxy which
 * forwards to the backend service.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public endpoints: the login page itself and the auth handshake.
  if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = await verifySessionToken(token);

  if (!authenticated) {
    // API calls get a 401 so the client can react; pages get redirected.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  // SameSite cookies alone do not prevent requests from hostile sibling
  // subdomains (they are same-site). Require an exact same-origin Origin for
  // every state-changing dashboard API request.
  const mutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (pathname.startsWith('/api/') && mutatingMethod) {
    const origin = req.headers.get('origin');
    if (!origin) {
      return NextResponse.json({ error: 'Forbidden: missing request origin.' }, { status: 403 });
    }

    try {
      const parsedOrigin = new URL(origin);
      const requestHost = req.headers.get('host');
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
