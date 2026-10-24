/**
 * Cookie names and flags. Dependency-free so proxy.ts can import it. Both cookies are httpOnly
 * (no script access), SameSite=Lax (not sent on cross-site POST/PATCH/DELETE, which blocks CSRF on
 * the JSON API and logout) and Secure in production.
 */
export const SESSION_COOKIE = "kgt_session";
export const STATE_COOKIE = "kgt_oauth_state";

/** The state cookie is only needed by /auth/github and its callback. */
const STATE_PATH = "/auth/github";
const STATE_MAX_AGE_S = 10 * 60;

type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  expires?: Date;
  maxAge?: number;
};

const base = (path: string): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path,
});

export const sessionCookieOptions = (expiresAt: Date): CookieOptions => ({ ...base("/"), expires: expiresAt });
export const expiredSessionCookieOptions = (): CookieOptions => ({ ...base("/"), maxAge: 0 });
export const stateCookieOptions = (): CookieOptions => ({ ...base(STATE_PATH), maxAge: STATE_MAX_AGE_S });
export const expiredStateCookieOptions = (): CookieOptions => ({ ...base(STATE_PATH), maxAge: 0 });

/** Reads one cookie from the request's Cookie header (works for NextRequest and plain Request). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
