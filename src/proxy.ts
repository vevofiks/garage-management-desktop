import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (deprecated the old
// convention) — this file used to be ./middleware.ts at the project root,
// which Next 16 silently never invoked (wrong file name AND wrong location
// for a src/ layout, where proxy.ts must sit next to src/app). That meant
// every route was unprotected server-side. This is an "optimistic check"
// only (cookie presence, not session validity) per Next's own guidance —
// real verification happens in requireUser()/requireRole() on each API
// route and the client-side useAuth() guard in app-shell.tsx.
export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get('session')?.value;
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!sessionToken && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (sessionToken && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes are protected internally)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - any path with a file extension (public/ assets — favicon.ico,
     *   app-logo.png, etc. — served as static files, not app routes; the
     *   old matcher only excluded favicon.ico by name and 307'd every other
     *   /public asset to /login when unauthenticated, which silently broke
     *   next/image's server-side fetch of local images regardless of login
     *   state since that fetch never carries the browser's session cookie)
     */
    '/((?!api|_next/static|_next/image|.*\\..*).*)',
  ],
};
