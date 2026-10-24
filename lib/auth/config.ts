import { NextResponse } from "next/server";

/**
 * GitHub OAuth settings, read only from the environment (never hard-coded). The two base URLs exist
 * so E2E tests can point the flow at a local mock server; production uses the real GitHub.
 */
export type GithubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  /** e.g. https://todo.example.com (no trailing slash) */
  appBaseUrl: string;
  /** {APP_BASE_URL}/auth/github/callback — must equal the OAuth App's "Authorization callback URL". */
  redirectUri: string;
  oauthBaseUrl: string;
  apiBaseUrl: string;
};

/** Missing/invalid configuration. The message names variables only, never their values. */
export class ConfigError extends Error {}

const REQUIRED = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "APP_BASE_URL"] as const;

function baseUrl(name: string, fallback?: string): string {
  const raw = process.env[name]?.trim() || fallback;
  if (!raw) throw new ConfigError(`${name} 환경변수를 설정하세요`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} 환경변수가 올바른 URL이 아닙니다`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`${name} 환경변수는 http(s) URL이어야 합니다`);
  }
  // Production talks to GitHub and redirects users over https only. ALLOW_INSECURE_OAUTH_URLS=1 is a
  // test-only escape for the E2E run (`next start` = production against a local http mock server).
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_OAUTH_URLS !== "1") {
    throw new ConfigError(`${name} 환경변수는 프로덕션에서 https URL이어야 합니다`);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

export function githubOAuthConfig(): GithubOAuthConfig {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new ConfigError(`GitHub 로그인 설정이 없습니다: ${missing.join(", ")} 환경변수를 설정하세요`);
  }
  const appBaseUrl = baseUrl("APP_BASE_URL");
  return {
    clientId: process.env.GITHUB_CLIENT_ID!.trim(),
    clientSecret: process.env.GITHUB_CLIENT_SECRET!.trim(),
    appBaseUrl,
    redirectUri: `${appBaseUrl}/auth/github/callback`,
    oauthBaseUrl: baseUrl("GITHUB_OAUTH_BASE_URL", "https://github.com"),
    apiBaseUrl: baseUrl("GITHUB_API_BASE_URL", "https://api.github.com"),
  };
}

/**
 * Redirect to an internal path with a relative Location header: the browser stays on the host it
 * used (where its cookies live), and no host or URL from the request is ever echoed back, so there
 * is no open redirect. Paths are constants chosen by the server.
 */
export function localRedirect(path: `/${string}`, status: 302 | 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}

/** Config loading for the OAuth routes: the config, or a 500 `{ error }` response when it is missing/invalid. */
export function configOrErrorResponse(): GithubOAuthConfig | NextResponse {
  try {
    return githubOAuthConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
