import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { GithubProfile } from "@/lib/repo/users";
import type { GithubOAuthConfig } from "./config";

/** GitHub OAuth web flow (authorize → access_token → /user) with plain fetch. */

const TIMEOUT_MS = 10_000;
const USER_AGENT = "kanban-goal-todo";

/** A failed GitHub step. Messages are fixed texts: they never contain the code, token or secret. */
export class GithubOAuthError extends Error {}

export const newState = () => randomBytes(32).toString("base64url");

/** Constant-time comparison (hashing first makes the lengths equal, so length is not leaked either). */
export function statesMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function authorizeUrl(cfg: GithubOAuthConfig, state: string): URL {
  const url = new URL(`${cfg.oauthBaseUrl}/login/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url;
}

const tokenResponse = z.object({ access_token: z.string().min(1) });
const userResponse = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  avatar_url: z.string().nullish(),
});

async function readJson(res: Response, step: string): Promise<unknown> {
  if (!res.ok) throw new GithubOAuthError(`${step} 실패 (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new GithubOAuthError(`${step} 응답이 JSON이 아닙니다`);
  }
}

/** Exchanges the authorization code for an access token (kept in memory only, never stored). */
export async function exchangeCode(cfg: GithubOAuthConfig, code: string): Promise<string> {
  const res = await fetch(`${cfg.oauthBaseUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // GitHub reports a bad code as 200 { error: "bad_verification_code", ... }.
  const parsed = tokenResponse.safeParse(await readJson(res, "GitHub 토큰 교환"));
  if (!parsed.success) throw new GithubOAuthError("GitHub 토큰 교환 응답에 access_token이 없습니다");
  return parsed.data.access_token;
}

export async function fetchGithubProfile(cfg: GithubOAuthConfig, accessToken: string): Promise<GithubProfile> {
  const res = await fetch(`${cfg.apiBaseUrl}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = userResponse.safeParse(await readJson(res, "GitHub 사용자 조회"));
  if (!parsed.success) throw new GithubOAuthError("GitHub 사용자 응답 형식이 올바르지 않습니다");
  const avatar = parsed.data.avatar_url ?? "";
  return {
    githubId: parsed.data.id,
    username: parsed.data.login,
    // Rendered later as <img src>: accept only http(s) URLs.
    avatarUrl: /^https?:\/\//i.test(avatar) ? avatar : "",
  };
}
