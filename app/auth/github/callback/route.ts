import { NextResponse } from "next/server";
import { configOrErrorResponse, localRedirect } from "@/lib/auth/config";
import {
  expiredStateCookieOptions,
  readCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
  STATE_COOKIE,
} from "@/lib/auth/cookies";
import { exchangeCode, fetchGithubProfile, GithubOAuthError, statesMatch } from "@/lib/auth/github";
import { claimLegacyDataOnLogin } from "@/lib/auth/legacy";
import { connectDb } from "@/lib/db";
import { createSession, deleteSession, upsertGithubUser } from "@/lib/repo/users";

/** Login failure: back to /login with a fixed error code; no session is created. */
function fail(code: "denied" | "state" | "github") {
  const res = localRedirect(`/login?error=${code}`, 302);
  res.cookies.set(STATE_COOKIE, "", expiredStateCookieOptions());
  return res;
}

/** Log text without request data: our own fixed messages, or just the error class otherwise. */
const describe = (err: unknown) =>
  err instanceof GithubOAuthError ? err.message : err instanceof Error ? err.name : "알 수 없는 오류";

/**
 * GitHub redirects here with ?code&state. The state must match the cookie set by /auth/github
 * (constant-time compare; the cookie is deleted on every outcome, so it is single-use). Then the
 * code is exchanged for a token, the profile is upserted, legacy data may be claimed and a new
 * session replaces any previous one.
 */
export async function GET(req: Request) {
  const cfg = configOrErrorResponse();
  if (cfg instanceof NextResponse) return cfg;

  const params = new URL(req.url).searchParams;
  if (params.get("error")) return fail("denied");
  const code = params.get("code");
  const state = params.get("state");
  const expected = readCookie(req, STATE_COOKIE);
  if (!code || !state || !expected || !statesMatch(state, expected)) return fail("state");

  let session;
  try {
    const accessToken = await exchangeCode(cfg, code);
    const profile = await fetchGithubProfile(cfg, accessToken);
    await connectDb();
    const user = await upsertGithubUser(profile);
    await claimLegacyDataOnLogin(user);
    // Never reuse a token that existed before login (session fixation): revoke it, issue a new one.
    const previous = readCookie(req, SESSION_COOKIE);
    if (previous) await deleteSession(previous);
    session = await createSession(user.id);
  } catch (err) {
    console.error(`GitHub 로그인 실패: ${describe(err)}`);
    return fail("github");
  }

  const res = localRedirect("/", 302);
  res.cookies.set(STATE_COOKIE, "", expiredStateCookieOptions());
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
}
