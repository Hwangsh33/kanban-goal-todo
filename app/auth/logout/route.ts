import { NextResponse } from "next/server";
import { localRedirect } from "@/lib/auth/config";
import { expiredSessionCookieOptions, readCookie, SESSION_COOKIE } from "@/lib/auth/cookies";
import { connectDb } from "@/lib/db";
import { deleteSession } from "@/lib/repo/users";

/**
 * Logout: deletes the session document (the token can never be used again) and expires the cookie,
 * then 303 to /login. POST only — the SameSite=Lax cookie is not sent on cross-site POSTs (no CSRF).
 * If the session cannot be deleted, the cookie is kept and 503 is returned: a revocation that did
 * not happen is never reported as a successful logout, and the user can simply retry.
 */
export async function POST(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  try {
    if (token) {
      await connectDb();
      await deleteSession(token);
    }
  } catch (err) {
    console.error(`로그아웃 실패: ${err instanceof Error ? err.name : "알 수 없는 오류"}`);
    return NextResponse.json({ error: "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요" }, { status: 503 });
  }
  const res = localRedirect("/login", 303);
  res.cookies.set(SESSION_COOKIE, "", expiredSessionCookieOptions());
  return res;
}
