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

  if (authenticated) {
    return NextResponse.next();
  }

  // API calls get a 401 so the client can react; pages get redirected.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Build the redirect from the *forwarded* host so it points at the public
  // tunnel origin rather than the internal listener (e.g. localhost:3000).
  const forwardedHost =
    req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const forwardedProto =
    req.headers.get('x-forwarded-proto') || (forwardedHost === req.nextUrl.host ? req.nextUrl.protocol.replace(':', '') : 'https');

  const loginUrl = new URL('/login', `${forwardedProto}://${forwardedHost}`);
  return NextResponse.redirect(loginUrl);
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
