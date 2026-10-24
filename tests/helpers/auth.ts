import { beforeEach } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { createSession, upsertGithubUser } from "@/lib/repo/users";
import type { OwnerId } from "@/lib/repo/visibility";
import { setApiCookie } from "./api";

export type TestUser = { userId: OwnerId; githubId: number; username: string; token: string; cookie: string };

// Far above the small ids the tests give mocked GitHub logins (42, 7, 99...), so they never collide.
let nextGithubId = 100_001;

/** Creates a User (as if logged in with GitHub) and a session; returns the Cookie header value. */
export async function createTestUser(username = `tester${nextGithubId}`): Promise<TestUser> {
  const githubId = nextGithubId++;
  const user = await upsertGithubUser({
    githubId,
    username,
    avatarUrl: `https://avatars.example.com/${username}.png`,
  });
  const { token } = await createSession(user.id);
  return { userId: user.id, githubId, username, token, cookie: `${SESSION_COOKIE}=${token}` };
}

/**
 * Auth context for tests written before login existed: before each test, creates a fresh user +
 * session (setupTestDb wipes collections after each test) and makes `api` send its cookie.
 * `auth.userId` is that user's id, for tests that call repo functions directly.
 */
export function setupAuth(): { readonly userId: OwnerId; readonly user: TestUser } {
  let current: TestUser | null = null;
  beforeEach(async () => {
    current = await createTestUser();
    setApiCookie(current.cookie);
  });
  return {
    get user() {
      if (!current) throw new Error("setupAuth: no user yet (use it inside a test)");
      return current;
    },
    get userId() {
      return this.user.userId;
    },
  };
}
