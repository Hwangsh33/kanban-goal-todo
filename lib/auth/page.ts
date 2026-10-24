import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { findSessionUser, type SessionUser } from "@/lib/repo/users";
import { SESSION_COOKIE } from "./cookies";

/**
 * The logged-in user of the current page request (session cookie validated against the database),
 * or null. Used by the layout (nav user menu) and /login (already logged in → /).
 */
export async function getPageUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await connectDb();
  return findSessionUser(token);
}

/**
 * Server-side (secure) auth check for protected pages: validates the session cookie against the
 * database and redirects to /login otherwise. proxy.ts only does the optimistic cookie-presence
 * check; this one also catches logged-out or expired sessions.
 */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return user;
}
