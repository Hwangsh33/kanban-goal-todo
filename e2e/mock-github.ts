import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local stand-in for the three GitHub endpoints the app calls (see lib/auth/github.ts):
 *   GET  {GITHUB_OAUTH_BASE_URL}/login/oauth/authorize    → consent page: one link per mock user (+ cancel)
 *   POST {GITHUB_OAUTH_BASE_URL}/login/oauth/access_token → single-use code → access token (JSON)
 *   GET  {GITHUB_API_BASE_URL}/user                       → profile of the token's user
 * It checks client_id/client_secret/redirect_uri like GitHub does, so a wrong APP_BASE_URL or
 * credential fails the E2E run. Test-only values: nothing here is a real secret.
 */
export const MOCK_GITHUB_USERS = [
  { id: 7_000_001, login: "e2e-alice" },
  { id: 7_000_002, login: "e2e-bob" },
  { id: 7_000_003, login: "e2e-kanban" },
] as const;

export type MockGithubOptions = { clientId: string; clientSecret: string; redirectUri: string };

// 1x1 transparent PNG served as every user's avatar.
const AVATAR_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, string>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if ((req.headers["content-type"] ?? "").includes("application/json")) {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function startMockGithub(opts: MockGithubOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const codes = new Map<string, { userIndex: number; redirectUri: string }>();
  const tokens = new Map<string, number>();
  const newSecret = () => randomBytes(16).toString("hex");
  let baseUrl = "";

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", baseUrl);

      if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
        const q = url.searchParams;
        const redirectUri = q.get("redirect_uri") ?? "";
        const state = q.get("state") ?? "";
        if (q.get("client_id") !== opts.clientId) return send(res, 400, "unknown client_id", "text/plain");
        if (redirectUri !== opts.redirectUri) return send(res, 400, "redirect_uri mismatch", "text/plain");
        if (!state || q.get("scope") !== "read:user") return send(res, 400, "missing state or scope", "text/plain");

        const back = (params: Record<string, string>) => `${redirectUri}?${new URLSearchParams({ ...params, state })}`;
        const links = MOCK_GITHUB_USERS.map((u, userIndex) => {
          const code = newSecret();
          codes.set(code, { userIndex, redirectUri });
          return `<li><a href="${escapeHtml(back({ code }))}">Sign in as ${escapeHtml(u.login)}</a></li>`;
        }).join("");
        const cancel = `<a href="${escapeHtml(back({ error: "access_denied" }))}">Cancel</a>`;
        return send(res, 200, `<!doctype html><title>Mock GitHub</title><h1>Authorize app</h1><ul>${links}</ul>${cancel}`, "text/html; charset=utf-8");
      }

      if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
        const body = await readBody(req);
        if (body.client_id !== opts.clientId || body.client_secret !== opts.clientSecret) {
          return send(res, 200, { error: "incorrect_client_credentials" });
        }
        const grant = codes.get(body.code ?? "");
        codes.delete(body.code ?? ""); // single use, like GitHub
        if (!grant || grant.redirectUri !== body.redirect_uri) return send(res, 200, { error: "bad_verification_code" });
        const token = `mock_${newSecret()}`;
        tokens.set(token, grant.userIndex);
        return send(res, 200, { access_token: token, token_type: "bearer", scope: "read:user" });
      }

      if (req.method === "GET" && url.pathname === "/user") {
        const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
        const userIndex = tokens.get(token);
        if (userIndex === undefined) return send(res, 401, { message: "Bad credentials" });
        const u = MOCK_GITHUB_USERS[userIndex];
        return send(res, 200, { id: u.id, login: u.login, avatar_url: `${baseUrl}/avatars/${u.login}.png` });
      }

      if (req.method === "GET" && url.pathname.startsWith("/avatars/")) return send(res, 200, AVATAR_PNG, "image/png");

      send(res, 404, { message: "Not Found" });
    } catch {
      send(res, 500, { message: "mock error" });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
