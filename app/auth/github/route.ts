import { NextResponse } from "next/server";
import { configOrErrorResponse } from "@/lib/auth/config";
import { STATE_COOKIE, stateCookieOptions } from "@/lib/auth/cookies";
import { authorizeUrl, newState } from "@/lib/auth/github";

/** Starts GitHub login: a fresh single-use `state` in an httpOnly cookie, then 302 to GitHub. */
export async function GET() {
  const cfg = configOrErrorResponse();
  if (cfg instanceof NextResponse) return cfg;
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(cfg, state), 302);
  res.cookies.set(STATE_COOKIE, state, stateCookieOptions());
  return res;
}
