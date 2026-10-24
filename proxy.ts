import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookies";

/**
 * Optimistic page guard (Next.js 16 Proxy, formerly Middleware): no session cookie → /login.
 * It only checks that the cookie exists (no DB access, per the Next.js auth guide). Every protected
 * page also calls requirePageUser() (DB check) and every API route requires a valid session (401).
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Everything except the JSON API (answers 401 itself), the auth routes, /login and static assets.
  // Whole segments only ((?:/|$) and /?$), so look-alikes such as /apix or /login2 are still guarded.
  matcher: ["/((?!(?:api|auth)(?:/|$)|login/?$|_next/static|_next/image|favicon\\.ico$).*)"],
};
