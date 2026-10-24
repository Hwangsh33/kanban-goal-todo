import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { deleteSession } from "@/lib/repo/users";
import { config, proxy } from "@/proxy";
import { createTestUser } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

// Server Component request APIs, replaced so pages can be called outside a Next.js request.
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kgt_session" && cookieJar.value ? { name, value: cookieJar.value } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

setupTestDb();

beforeEach(() => {
  cookieJar.value = undefined;
});

const root = path.resolve(import.meta.dirname, "../..");
const PUBLIC_PAGES = ["/login"];

/** Every app/**\/page.tsx as a route path. */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    if (name !== "page.tsx") return [];
    const rel = path.relative(path.join(root, "app"), dir).split(path.sep).join("/");
    return [rel ? `/${rel}` : "/"];
  });
}
const protectedPages = pages(path.join(root, "app")).filter((p) => !PUBLIC_PAGES.includes(p));

describe("proxy.ts (optimistic check)", () => {
  it("runs on pages but not on the API, auth routes, /login or static assets", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
    for (const url of ["/", "/manage", "/trash", "/goals", "/plans", "/todos"]) expect({ url, m: matches(url) }).toEqual({ url, m: true });
    for (const url of ["/api/goals", "/api/todos/1/move", "/auth/github", "/auth/github/callback", "/auth/logout", "/login", "/_next/static/chunk.js", "/favicon.ico"]) {
      expect({ url, m: matches(url) }).toEqual({ url, m: false });
    }
  });

  it("excludes only whole path segments: look-alike paths such as /apix or /login2 are still guarded", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
    for (const url of ["/api", "/auth", "/login", "/login/"]) expect({ url, m: matches(url) }).toEqual({ url, m: false });
    for (const url of ["/apix", "/api-docs", "/authority", "/auth-admin", "/login2", "/loginx", "/login/extra", "/favicon.icox"]) {
      expect({ url, m: matches(url) }).toEqual({ url, m: true });
    }
  });

  it("redirects to /login without a session cookie and lets requests with one through", () => {
    const anonymous = proxy(new NextRequest("http://localhost:3000/manage"));
    expect(getRedirectUrl(anonymous)).toBe("http://localhost:3000/login");

    const withCookie = proxy(new NextRequest("http://localhost:3000/manage", { headers: { cookie: `${SESSION_COOKIE}=abc` } }));
    expect(getRedirectUrl(withCookie)).toBeNull();
    expect(withCookie.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("protected pages (server-side session check)", () => {
  it("covers /, /manage and /trash (and every other page except /login)", () => {
    expect(protectedPages).toEqual(expect.arrayContaining(["/", "/manage", "/trash"]));
  });

  describe.each(protectedPages)("%s", (route) => {
    const load = async () => (await import(/* @vite-ignore */ `@/app${route === "/" ? "" : route}/page.tsx`)).default as () => Promise<unknown>;

    it("redirects to /login without a cookie and with an unknown (or revoked) token", async () => {
      const Page = await load();
      await expect(Page()).rejects.toThrow("REDIRECT:/login");
      cookieJar.value = "not-a-real-token";
      await expect(Page()).rejects.toThrow("REDIRECT:/login");
    });

    it("renders for a logged-in user", async () => {
      const Page = await load();
      cookieJar.value = (await createTestUser()).token;
      await expect(Page()).resolves.toBeTruthy();
    });
  });
});

describe("getPageUser (nav user menu) and /login (server-side session check)", () => {
  const loginPage = async () => (await import("@/app/login/page")).default;
  const loginProps = { params: Promise.resolve({}), searchParams: Promise.resolve({}) } as PageProps<"/login">;

  it("returns the logged-in user, and null without a cookie or with a revoked token", async () => {
    const { getPageUser } = await import("@/lib/auth/page");
    expect(await getPageUser()).toBeNull();

    const user = await createTestUser("nav-user");
    cookieJar.value = user.token;
    expect(await getPageUser()).toMatchObject({ username: "nav-user", avatarUrl: "https://avatars.example.com/nav-user.png" });

    await deleteSession(user.token);
    expect(await getPageUser()).toBeNull();
  });

  it("/login renders for visitors (also with an unknown token) and redirects a logged-in user to /", async () => {
    const LoginPage = await loginPage();
    await expect(LoginPage(loginProps)).resolves.toBeTruthy();
    cookieJar.value = "not-a-real-token";
    await expect(LoginPage(loginProps)).resolves.toBeTruthy();

    cookieJar.value = (await createTestUser()).token;
    await expect(LoginPage(loginProps)).rejects.toThrow("REDIRECT:/");
  });
});
