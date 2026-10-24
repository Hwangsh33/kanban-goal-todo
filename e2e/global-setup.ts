import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startMockGithub } from "./mock-github";
import { E2E_BASE_URL, E2E_PORT } from "./port";

// npm scripts run from the project root.
const root = process.cwd();

// Dummy OAuth App credentials, known only to this setup and the mock server (not real secrets).
const E2E_CLIENT_ID = "e2e-client-id";
const E2E_CLIENT_SECRET = "e2e-client-secret-not-a-real-secret";

async function waitForServer(url: string, server: ChildProcess, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early with code ${server.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start did not answer on ${url} within ${timeoutMs}ms`);
}

function stop(server: ChildProcess) {
  if (server.exitCode !== null || server.pid === undefined) return;
  // On Windows kill the whole process tree; elsewhere SIGTERM is enough.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  else server.kill("SIGTERM");
}

/**
 * Starts an in-memory MongoDB, a mock GitHub OAuth server (e2e/mock-github.ts) and the built
 * Next.js app (`next start`) wired to both. Specs log in through the real /auth/github flow.
 */
export default async function globalSetup() {
  const mongo = await MongoMemoryServer.create();
  const uri = `${mongo.getUri().replace(/\/?$/, "/")}kanban_e2e`;
  const github = await startMockGithub({
    clientId: E2E_CLIENT_ID,
    clientSecret: E2E_CLIENT_SECRET,
    redirectUri: `${E2E_BASE_URL}/auth/github/callback`,
  });

  // Process env wins over .env/.env.local, so a developer's real OAuth settings are never used here.
  const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(E2E_PORT)], {
    cwd: root,
    env: {
      ...process.env,
      MONGODB_URI: uri,
      APP_TIMEZONE: process.env.APP_TIMEZONE ?? "Asia/Seoul",
      GITHUB_CLIENT_ID: E2E_CLIENT_ID,
      GITHUB_CLIENT_SECRET: E2E_CLIENT_SECRET,
      APP_BASE_URL: E2E_BASE_URL,
      GITHUB_OAUTH_BASE_URL: github.url,
      GITHUB_API_BASE_URL: github.url,
      // Test-only: `next start` runs with NODE_ENV=production, where lib/auth/config.ts accepts only
      // https base URLs; the mock server and APP_BASE_URL are plain http on localhost. Never set this
      // in a real deployment (it is deliberately not in .env.example).
      ALLOW_INSECURE_OAUTH_URLS: "1",
      LEGACY_OWNER_GITHUB_ID: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout?.on("data", (d) => (log += d));
  server.stderr?.on("data", (d) => (log += d));

  const shutdown = async () => {
    stop(server);
    await github.close();
    await mongo.stop();
  };

  try {
    // /api/* answers 401 without a session; the public login page is a readiness probe.
    await waitForServer(`${E2E_BASE_URL}/login`, server);
  } catch (err) {
    await shutdown();
    throw new Error(`${(err as Error).message}\n${log}`);
  }

  return shutdown;
}
