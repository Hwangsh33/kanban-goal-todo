import { AppError } from "@/lib/errors";
import { findSessionUser, type SessionUser } from "@/lib/repo/users";
import { readCookie, SESSION_COOKIE } from "./cookies";

/** The logged-in user of an API request (valid, unexpired session cookie); 401 AppError otherwise. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const token = readCookie(req, SESSION_COOKIE);
  const user = token ? await findSessionUser(token) : null;
  if (!user) throw new AppError(401, "로그인이 필요합니다");
  return user;
}
