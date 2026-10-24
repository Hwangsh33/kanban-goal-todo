import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { createSession } from "@/lib/repo/users";
import { createTestUser } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();

const root = path.resolve(import.meta.dirname, "../..");
const apiDir = path.join(root, "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every app/api/** route.ts on disk, as route paths like "/api/goals/[id]". */
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}
const routes = routeFiles(apiDir).map((file) => ({
  file,
  route: "/" + path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).join("/"),
}));

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Imports a route module and lists its HTTP method handlers. */
async function handlersOf(route: string) {
  const mod = (await import(/* @vite-ignore */ `@/app${route}/route.ts`)) as Partial<Record<(typeof METHODS)[number], Handler>>;
  return METHODS.filter((m) => typeof mod[m] === "function").map((m) => ({ method: m, fn: mod[m]! }));
}

/** Plausible params/body so the only reason to fail is authentication. */
function call(fn: Handler, method: string, route: string, cookie?: string) {
  const id = "0123456789abcdef01234567";
  const params: Record<string, string> = {};
  for (const [, name] of route.matchAll(/\[(\w+)\]/g)) params[name] = name === "type" ? "goal" : id;
  const url = `http://localhost${route.replace(/\[(\w+)\]/g, (_m, name: string) => params[name])}`;
  const body = method === "GET" || method === "DELETE" ? undefined : JSON.stringify({ title: "x", year: 2030, type: "goal", id, status: "done", seq: 1 });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return fn(new Request(url, { method, headers, body }), { params: Promise.resolve(params) });
}

describe("every /api route requires a session (401 JSON)", () => {
  it("finds all API route files, including the ones listed in the PRD", () => {
    const found = routes.map((r) => r.route).sort();
    expect(found).toEqual(
      expect.arrayContaining([
        "/api/board",
        "/api/goals",
        "/api/goals/[id]",
        "/api/goals/[id]/progress",
        "/api/todos",
        "/api/todos/[id]",
        "/api/todos/[id]/move",
        "/api/trash",
        "/api/trash/[type]/[id]",
        "/api/trash/restore",
        "/api/weekly-plans",
        "/api/weekly-plans/[id]",
        "/api/weekly-plans/[id]/progress",
      ]),
    );
  });

  // Enumerated from disk at collection time: a new route file is covered automatically and fails
  // here until it requires a session.
  describe.each(routes.map((r) => r.route))("%s", (route) => {
    it("answers 401 to every method without a session, with an invalid token and with an expired session", async () => {
      const handlers = await handlersOf(route);
      expect(handlers.length).toBeGreaterThan(0);

      const me = await createTestUser();
      const expired = await createSession(me.userId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const cookies = [undefined, `${SESSION_COOKIE}=not-a-real-token`, `${SESSION_COOKIE}=${expired.token}`, "other=1"];

      for (const { method, fn } of handlers) {
        for (const cookie of cookies) {
          const res = await call(fn, method, route, cookie);
          expect({ method, cookie, status: res.status }).toEqual({ method, cookie, status: 401 });
          expect(res.headers.get("content-type")).toContain("application/json");
          expect(await res.json()).toEqual({ error: "로그인이 필요합니다" });
        }
        // Sanity check: with a valid session the same request is not rejected as unauthenticated.
        const ok = await call(fn, method, route, me.cookie);
        expect({ method, status: ok.status === 401 }).toEqual({ method, status: false });
      }
    });
  });
});
