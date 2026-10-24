import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as callbackRoute from "@/app/auth/github/callback/route";
import * as githubRoute from "@/app/auth/github/route";
import * as logoutRoute from "@/app/auth/logout/route";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/auth/cookies";
import { Goal, Session, Todo, User, WeeklyPlan } from "@/lib/models";
import { apiAs } from "../helpers/api";
import { createTestUser } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();

const SECRET = "test-client-secret-value";
const ACCESS_TOKEN = "gho_test_access_token_value";
const CODE = "test-auth-code";
const ENV = {
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: SECRET,
  APP_BASE_URL: "http://localhost:3000",
  GITHUB_OAUTH_BASE_URL: "",
  GITHUB_API_BASE_URL: "",
  LEGACY_OWNER_GITHUB_ID: "",
  ALLOW_INSECURE_OAUTH_URLS: "",
};

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Cookie = { value: string; attrs: string };
function setCookies(res: Response): Record<string, Cookie> {
  const out: Record<string, Cookie> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const eq = pair.indexOf("=");
    out[pair.slice(0, eq).trim()] = { value: decodeURIComponent(pair.slice(eq + 1)), attrs: attrs.join(";").toLowerCase() };
  }
  return out;
}

type FetchCall = { url: string; init: RequestInit };
type GithubMock = { token?: unknown; tokenStatus?: number; user?: unknown; userStatus?: number };
const OCTOCAT = { id: 42, login: "octocat", avatar_url: "https://avatars.githubusercontent.com/u/42?v=4" };

/** Stubs fetch as GitHub's token and user endpoints. */
function mockGithub(opts: GithubMock = {}) {
  const calls: FetchCall[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/login/oauth/access_token")) {
        return json(opts.token ?? { access_token: ACCESS_TOKEN, token_type: "bearer", scope: "read:user" }, opts.tokenStatus);
      }
      if (url.endsWith("/user")) return json(opts.user ?? OCTOCAT, opts.userStatus);
      return json({ message: "Not Found" }, 404);
    }),
  );
  return calls;
}

/** GET /auth/github → the state value and its cookie. */
async function startLogin() {
  const res = await githubRoute.GET();
  const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
  return { res, state, cookie: `${STATE_COOKIE}=${setCookies(res)[STATE_COOKIE].value}` };
}

function callback(query: Record<string, string>, cookies: string[] = []) {
  const qs = new URLSearchParams(query).toString();
  return callbackRoute.GET(
    new Request(`http://localhost:3000/auth/github/callback?${qs}`, { headers: cookies.length ? { cookie: cookies.join("; ") } : {} }),
  );
}

/** Captures console output to assert that no secret/token is ever logged. */
function captureLogs() {
  const lines: string[] = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  }
  return lines;
}

async function expectNoSession() {
  expect(await Session.countDocuments()).toBe(0);
}

describe("models", () => {
  it("User has a unique githubId, Session a unique tokenHash and a TTL index on expiresAt", async () => {
    await Promise.all([User.init(), Session.init()]);
    const userIdx = await User.collection.indexes();
    expect(userIdx.find((i) => i.key.githubId === 1)?.unique).toBe(true);
    const sessionIdx = await Session.collection.indexes();
    expect(sessionIdx.find((i) => i.key.tokenHash === 1)?.unique).toBe(true);
    expect(sessionIdx.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
    expect(sessionIdx.some((i) => i.key.userId === 1)).toBe(true);
  });
});

describe("GET /auth/github", () => {
  it("sets a random httpOnly state cookie and 302-redirects to GitHub's authorize URL", async () => {
    const { res, state } = await startLogin();
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: "test-client-id",
      redirect_uri: "http://localhost:3000/auth/github/callback",
      scope: "read:user",
      state,
    });
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    const cookie = setCookies(res)[STATE_COOKIE];
    expect(cookie.value).toBe(state);
    expect(cookie.attrs).toContain("httponly");
    expect(cookie.attrs).toContain("samesite=lax");
    expect(cookie.attrs).toContain("path=/auth/github");
    expect(cookie.attrs).toContain("max-age=600");
    expect(cookie.attrs).not.toContain("secure");
    // The secret never leaves the server.
    expect(res.headers.get("location")).not.toContain(SECRET);

    const again = await startLogin();
    expect(again.state).not.toBe(state);
  });

  it("marks cookies Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://todo.example.com");
    const { res } = await startLogin();
    expect(setCookies(res)[STATE_COOKIE].attrs).toContain("secure");
  });

  it("uses GITHUB_OAUTH_BASE_URL when set (mock server for E2E)", async () => {
    vi.stubEnv("GITHUB_OAUTH_BASE_URL", "http://127.0.0.1:4555/");
    const { res } = await startLogin();
    expect(res.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:4555\/login\/oauth\/authorize\?/);
  });

  describe("production requires https base URLs (L1)", () => {
    const INSECURE = "http://insecure-host.example:8080";

    it.each(["APP_BASE_URL", "GITHUB_OAUTH_BASE_URL", "GITHUB_API_BASE_URL"])(
      "%s over http → 500 naming the variable, never its value; no cookie",
      async (name) => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_BASE_URL", "https://todo.example.com");
        vi.stubEnv(name, INSECURE);
        const logs = captureLogs();
        const res = await githubRoute.GET();
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toContain(name);
        expect(body.error).toContain("https");
        expect(body.error).not.toContain("insecure-host");
        expect(logs.join("\n")).not.toContain("insecure-host");
        expect(res.headers.getSetCookie()).toEqual([]);
      },
    );

    it("the callback refuses an http base URL in production too (no GitHub call, no session)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_BASE_URL", "https://todo.example.com");
      vi.stubEnv("GITHUB_API_BASE_URL", INSECURE);
      const calls = mockGithub();
      captureLogs();
      const res = await callback({ code: CODE, state: "x" }, [`${STATE_COOKIE}=x`]);
      expect(res.status).toBe(500);
      expect((await res.json()).error).toContain("GITHUB_API_BASE_URL");
      expect(calls).toEqual([]);
      await expectNoSession();
    });

    it("accepts https URLs in production (defaults and explicit)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_BASE_URL", "https://todo.example.com");
      let { res } = await startLogin();
      expect(res.headers.get("location")).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
      vi.stubEnv("GITHUB_OAUTH_BASE_URL", "https://ghe.example.com");
      ({ res } = await startLogin());
      expect(res.headers.get("location")).toMatch(/^https:\/\/ghe\.example\.com\/login\/oauth\/authorize\?/);
    });

    it("outside production http stays allowed (local dev, tests)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("GITHUB_OAUTH_BASE_URL", "http://127.0.0.1:4555");
      const { res } = await startLogin();
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:4555\//);
    });

    it("ALLOW_INSECURE_OAUTH_URLS=1 (E2E only) allows http in production; other values do not", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("GITHUB_OAUTH_BASE_URL", "http://127.0.0.1:4555");
      vi.stubEnv("ALLOW_INSECURE_OAUTH_URLS", "true");
      captureLogs();
      expect((await githubRoute.GET()).status).toBe(500);
      vi.stubEnv("ALLOW_INSECURE_OAUTH_URLS", "1");
      const { res } = await startLogin();
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:4555\//);
    });
  });

  it.each(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "APP_BASE_URL"])(
    "fails clearly (500, names the variable) when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      const logs = captureLogs();
      const res = await githubRoute.GET();
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain(name);
      expect(body.error).not.toContain(SECRET);
      expect(logs.join("\n")).not.toContain(SECRET);
      expect(res.headers.getSetCookie()).toEqual([]);
    },
  );
});

describe("GET /auth/github/callback", () => {
  it("logs in: exchanges the code, stores username/avatarUrl, sets the session cookie, clears state, 302 to /", async () => {
    const calls = mockGithub();
    const { state, cookie } = await startLogin();
    const res = await callback({ code: CODE, state }, [cookie]);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");

    // GitHub calls: token exchange (JSON) and /user with the bearer token + User-Agent.
    expect(calls.map((c) => c.url)).toEqual([
      "https://github.com/login/oauth/access_token",
      "https://api.github.com/user",
    ]);
    const tokenCall = calls[0];
    expect(tokenCall.init.method).toBe("POST");
    expect(new Headers(tokenCall.init.headers).get("accept")).toBe("application/json");
    expect(JSON.parse(String(tokenCall.init.body))).toEqual({
      client_id: "test-client-id",
      client_secret: SECRET,
      code: CODE,
      redirect_uri: "http://localhost:3000/auth/github/callback",
    });
    const userHeaders = new Headers(calls[1].init.headers);
    expect(userHeaders.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(userHeaders.get("user-agent")).toBeTruthy();

    // User stored with GitHub id, username and avatar URL; the access token is not stored anywhere.
    const users = await User.find().lean();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ githubId: 42, username: "octocat", avatarUrl: OCTOCAT.avatar_url });
    expect(users[0].createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(users[0])).not.toContain(ACCESS_TOKEN);

    // Session cookie: httpOnly, SameSite=Lax, Path=/; only the SHA-256 hash is in the DB.
    const cookies = setCookies(res);
    const session = cookies[SESSION_COOKIE];
    expect(session.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.attrs).toContain("httponly");
    expect(session.attrs).toContain("samesite=lax");
    expect(session.attrs).toContain("path=/");
    expect(session.attrs).toContain("expires=");
    const docs = await Session.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].tokenHash).toBe(createHash("sha256").update(session.value).digest("hex"));
    expect(JSON.stringify(docs[0])).not.toContain(session.value);
    expect(JSON.stringify(docs[0])).not.toContain(ACCESS_TOKEN);
    expect(String(docs[0].userId)).toBe(String(users[0]._id));
    expect(docs[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    // State cookie deleted (single use).
    expect(cookies[STATE_COOKIE].value).toBe("");
    expect(cookies[STATE_COOKIE].attrs).toContain("max-age=0");
    expect(cookies[STATE_COOKIE].attrs).toContain("path=/auth/github");

    // The new cookie authenticates API requests.
    expect((await apiAs(`${SESSION_COOKIE}=${session.value}`).goals.list()).status).toBe(200);
  });

  it("updates username/avatar on a later login of the same GitHub account (no duplicate user)", async () => {
    mockGithub();
    let login = await startLogin();
    await callback({ code: CODE, state: login.state }, [login.cookie]);
    mockGithub({ user: { id: 42, login: "octo-renamed", avatar_url: "https://avatars.githubusercontent.com/u/42?v=5" } });
    login = await startLogin();
    await callback({ code: CODE, state: login.state }, [login.cookie]);
    const users = await User.find().lean();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ githubId: 42, username: "octo-renamed", avatarUrl: "https://avatars.githubusercontent.com/u/42?v=5" });
  });

  it.each([
    ["state does not match the cookie", (s: string) => ({ query: { code: CODE, state: `${s}x` }, withCookie: true })],
    ["state cookie is missing", (s: string) => ({ query: { code: CODE, state: s }, withCookie: false })],
    ["state query is missing", () => ({ query: { code: CODE }, withCookie: true })],
    ["code is missing", (s: string) => ({ query: { state: s }, withCookie: true })],
  ])("refuses when %s: redirect to /login?error=state, no GitHub call, no session", async (_name, make) => {
    const calls = mockGithub();
    const { state, cookie } = await startLogin();
    const { query, withCookie } = make(state);
    const res = await callback(query as Record<string, string>, withCookie ? [cookie] : []);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=state");
    expect(calls).toEqual([]);
    expect(setCookies(res)[SESSION_COOKIE]).toBeUndefined();
    expect(setCookies(res)[STATE_COOKIE].attrs).toContain("max-age=0");
    await expectNoSession();
    expect(await User.countDocuments()).toBe(0);
  });

  it("a state value cannot be replayed once the cookie was consumed", async () => {
    mockGithub();
    const { state, cookie } = await startLogin();
    const first = await callback({ code: CODE, state }, [cookie]);
    expect(first.headers.get("location")).toBe("/");
    // The browser drops the state cookie (Max-Age=0); a replay without it is refused.
    const replay = await callback({ code: CODE, state }, []);
    expect(replay.headers.get("location")).toBe("/login?error=state");
    expect(await Session.countDocuments()).toBe(1);
  });

  it("GitHub error (e.g. access_denied) → /login?error=denied without calling GitHub", async () => {
    const calls = mockGithub();
    const { state, cookie } = await startLogin();
    const res = await callback({ error: "access_denied", error_description: "The user has denied", state }, [cookie]);
    expect(res.headers.get("location")).toBe("/login?error=denied");
    expect(calls).toEqual([]);
    await expectNoSession();
  });

  it.each<[string, GithubMock]>([
    ["token endpoint returns an error object", { token: { error: "bad_verification_code", error_description: "The code passed is incorrect or expired." } }],
    ["token endpoint fails", { tokenStatus: 500, token: { message: "boom" } }],
    ["user endpoint fails", { userStatus: 401, user: { message: "Bad credentials" } }],
    ["user response is malformed", { user: { id: "not-a-number", login: "" } }],
  ])("fails safely when the %s: no session/user, no secret or token in response or logs", async (_name, mock) => {
    mockGithub(mock);
    const logs = captureLogs();
    const { state, cookie } = await startLogin();
    const res = await callback({ code: CODE, state }, [cookie]);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toBe("/login?error=github");
    expect(setCookies(res)[SESSION_COOKIE]).toBeUndefined();
    await expectNoSession();
    expect(await User.countDocuments()).toBe(0);
    const exposed = [location, await res.text(), ...logs].join("\n");
    for (const secret of [SECRET, ACCESS_TOKEN, CODE, state]) expect(exposed).not.toContain(secret);
    expect(logs.some((l) => l.includes("GitHub 로그인 실패"))).toBe(true);
  });

  it("network failure while talking to GitHub fails safely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const logs = captureLogs();
    const { state, cookie } = await startLogin();
    const res = await callback({ code: CODE, state }, [cookie]);
    expect(res.headers.get("location")).toBe("/login?error=github");
    await expectNoSession();
    expect(logs.join("\n")).not.toContain(SECRET);
  });

  it("session fixation: a session cookie present before login is revoked and a new token is issued", async () => {
    const planted = await createTestUser("planted");
    mockGithub();
    const { state, cookie } = await startLogin();
    const res = await callback({ code: CODE, state }, [cookie, planted.cookie]);
    const fresh = setCookies(res)[SESSION_COOKIE].value;
    expect(fresh).not.toBe(planted.token);
    expect((await apiAs(planted.cookie).goals.list()).status).toBe(401);
    expect((await apiAs(`${SESSION_COOKIE}=${fresh}`).goals.list()).status).toBe(200);
  });

  it("missing configuration → clear 500 error, no session", async () => {
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    captureLogs();
    const res = await callback({ code: CODE, state: "x" }, [`${STATE_COOKIE}=x`]);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("GITHUB_CLIENT_SECRET");
    await expectNoSession();
  });
});

describe("POST /auth/logout", () => {
  const logout = (cookie?: string) =>
    logoutRoute.POST(new Request("http://localhost:3000/auth/logout", { method: "POST", headers: cookie ? { cookie } : {} }));

  it("deletes the session document, expires the cookie and the token stops working", async () => {
    const me = await createTestUser();
    const other = await createTestUser();
    expect((await apiAs(me.cookie).goals.list()).status).toBe(200);

    const res = await logout(me.cookie);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    const cookie = setCookies(res)[SESSION_COOKIE];
    expect(cookie.value).toBe("");
    expect(cookie.attrs).toContain("max-age=0");
    expect(cookie.attrs).toContain("path=/");
    expect(cookie.attrs).toContain("httponly");

    const tokenHash = createHash("sha256").update(me.token).digest("hex");
    expect(await Session.exists({ tokenHash })).toBeNull();
    const res401 = await apiAs(me.cookie).goals.list();
    expect(res401.status).toBe(401);
    expect(res401.body).toEqual({ error: "로그인이 필요합니다" });
    // Other sessions are unaffected.
    expect((await apiAs(other.cookie).goals.list()).status).toBe(200);
  });

  it("works without a cookie (just expires it)", async () => {
    const res = await logout();
    expect(res.status).toBe(303);
    expect(setCookies(res)[SESSION_COOKIE].attrs).toContain("max-age=0");
  });

  it("a failed session deletion keeps the cookie and answers 503 with a Korean retry message (never reported as success)", async () => {
    const me = await createTestUser();
    vi.spyOn(Session, "deleteOne").mockRejectedValueOnce(new Error("connection refused db.internal:27017"));
    const logs = captureLogs();
    const res = await logout(me.cookie);
    expect(res.status).toBe(503);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.getSetCookie()).toEqual([]);
    const body = await res.json();
    expect(body.error).toContain("로그아웃하지 못했습니다");
    expect(body.error).toContain("다시 시도");
    expect(JSON.stringify(body)).not.toContain("db.internal");
    expect(logs.join("\n")).not.toContain(me.token);
    expect(logs.join("\n")).not.toContain("db.internal");
    // The session is still valid (it was not revoked), so the user can simply retry.
    expect((await apiAs(me.cookie).goals.list()).status).toBe(200);
    const retry = await logout(me.cookie);
    expect(retry.status).toBe(303);
    expect(setCookies(retry)[SESSION_COOKIE].attrs).toContain("max-age=0");
    expect((await apiAs(me.cookie).goals.list()).status).toBe(401);
  });

  it("only POST is exported (no GET logout that a link or image could trigger)", () => {
    expect(Object.keys(logoutRoute)).toEqual(["POST"]);
  });
});

describe("sessions", () => {
  it("an expired session is not accepted even before the TTL monitor removes it", async () => {
    const { createSession } = await import("@/lib/repo/users");
    const me = await createTestUser();
    const { token } = await createSession(me.userId, new Date(Date.now() - 15 * 24 * 60 * 60 * 1000));
    expect((await apiAs(`${SESSION_COOKIE}=${token}`).goals.list()).status).toBe(401);
  });
});

describe("legacy data claim on login (AUTH-003)", () => {
  /** Data created before login existed: inserted without userId (bypassing the schema). */
  async function insertLegacyData() {
    const goal = await Goal.collection.insertOne({ title: "옛 목표", year: 2030, deletedAt: null });
    const plan = await WeeklyPlan.collection.insertOne({
      title: "옛 계획",
      weekStart: "2030-03-04",
      goalId: goal.insertedId,
      deletedAt: null,
    });
    await Todo.collection.insertMany([
      { title: "a", status: "done", date: "2030-03-04", dueDate: null, order: 1, lastSeq: 0, weeklyPlanId: plan.insertedId, deletedAt: null },
      { title: "b", status: "todo", date: "2030-03-05", dueDate: null, order: 2, lastSeq: 0, weeklyPlanId: plan.insertedId, deletedAt: new Date() },
    ]);
  }
  const unowned = async () =>
    (await Goal.countDocuments({ userId: null })) +
    (await WeeklyPlan.countDocuments({ userId: null })) +
    (await Todo.countDocuments({ userId: null }));

  async function loginAs(login: string, id: number) {
    mockGithub({ user: { id, login, avatar_url: null } });
    const { state, cookie } = await startLogin();
    const res = await callback({ code: CODE, state }, [cookie]);
    return `${SESSION_COOKIE}=${setCookies(res)[SESSION_COOKIE].value}`;
  }

  it("assigns unowned data (trashed included) to the user whose GitHub id is LEGACY_OWNER_GITHUB_ID on login", async () => {
    vi.stubEnv("LEGACY_OWNER_GITHUB_ID", "42");
    await insertLegacyData();
    captureLogs();
    const cookie = await loginAs("octocat", 42);
    expect(await unowned()).toBe(0);
    const owner = await User.findOne({ githubId: 42 }).lean();
    expect(await Todo.countDocuments({ userId: owner!._id })).toBe(2);
    const goals = await apiAs(cookie).goals.list();
    expect(goals.body).toMatchObject([{ title: "옛 목표", progress: { done: 1, total: 1, percent: 100 } }]);
    const trash = await apiAs(cookie).trash.list();
    expect(trash.body.map((i: { title: string }) => i.title)).toEqual(["b"]);
  });

  it("claims after the owner renamed the GitHub account (the id is what counts)", async () => {
    vi.stubEnv("LEGACY_OWNER_GITHUB_ID", " 42 ");
    await insertLegacyData();
    captureLogs();
    await loginAs("octocat-renamed", 42);
    expect(await unowned()).toBe(0);
  });

  it("does not assign anything when another GitHub id logs in", async () => {
    vi.stubEnv("LEGACY_OWNER_GITHUB_ID", "42");
    await insertLegacyData();
    const cookie = await loginAs("someone-else", 7);
    expect(await unowned()).toBe(4);
    expect((await apiAs(cookie).goals.list()).body).toEqual([]);
  });

  it("does not assign anything to a different account that now uses the owner's username", async () => {
    vi.stubEnv("LEGACY_OWNER_GITHUB_ID", "42");
    await insertLegacyData();
    const cookie = await loginAs("octocat", 99);
    expect(await unowned()).toBe(4);
    expect((await apiAs(cookie).goals.list()).body).toEqual([]);
  });

  it("is idempotent: a later login claims nothing new and never moves data owned by others", async () => {
    vi.stubEnv("LEGACY_OWNER_GITHUB_ID", "42");
    await insertLegacyData();
    captureLogs();
    const ownerCookie = await loginAs("octocat", 42);
    const owner = await User.findOne({ githubId: 42 }).lean();
    const other = await createTestUser("other");
    const othersGoal = (await apiAs(other.cookie).goals.create({ title: "남의 목표", year: 2030 })).body.id as string;

    await loginAs("octocat", 42);
    expect(await unowned()).toBe(0);
    expect(await Todo.countDocuments({ userId: owner!._id })).toBe(2);
    expect(String((await Goal.findById(othersGoal).lean())!.userId)).toBe(String(other.userId));
    expect((await apiAs(ownerCookie).goals.list()).body.map((g: { title: string }) => g.title)).toEqual(["옛 목표"]);
  });

  it("warns and assigns nothing when LEGACY_OWNER_GITHUB_ID is not set", async () => {
    await insertLegacyData();
    const logs = captureLogs();
    await loginAs("octocat", 42);
    expect(await unowned()).toBe(4);
    expect(logs.some((l) => l.includes("LEGACY_OWNER_GITHUB_ID"))).toBe(true);
  });

  it.each(["octocat", "42.5", "0", "-42", "42abc", "1e3", "0x2a", "99999999999999999999"])(
    "treats the invalid value %j as unset: warns, assigns nothing",
    async (value) => {
      vi.stubEnv("LEGACY_OWNER_GITHUB_ID", value);
      await insertLegacyData();
      const logs = captureLogs();
      await loginAs("octocat", 42);
      expect(await unowned()).toBe(4);
      expect(logs.some((l) => l.includes("LEGACY_OWNER_GITHUB_ID") && l.includes("양의 정수"))).toBe(true);
    },
  );
});

describe("no hard-coded secrets", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return /\.(ts|tsx|mjs|js)$/.test(name) ? [full] : [];
    });
  }
  const sources = [...files(path.join(root, "app")), ...files(path.join(root, "lib")), ...files(path.join(root, "scripts")), path.join(root, "proxy.ts")];

  it("no source still reads the username-based LEGACY_OWNER_GITHUB_LOGIN", () => {
    const offenders = sources.filter((f) => readFileSync(f, "utf8").includes("LEGACY_OWNER_GITHUB_LOGIN"));
    expect(offenders).toEqual([]);
  });

  it("OAuth credentials are read only from process.env", () => {
    const all = sources.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).toContain("process.env.GITHUB_CLIENT_SECRET");
    const offenders = sources.filter((f) => {
      const src = readFileSync(f, "utf8");
      return (
        /client_secret\s*[:=]\s*["'`][^"'`]+["'`]/i.test(src) ||
        /GITHUB_CLIENT_SECRET\s*[:=]\s*["'`][^"'`]+["'`]/.test(src) ||
        /\bgh[opsu]_[A-Za-z0-9]{20,}/.test(src) ||
        /["'`][0-9a-f]{40}["'`]/i.test(src)
      );
    });
    expect(offenders).toEqual([]);
  });

  it(".env.example documents the variables with empty secret values", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    for (const name of ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "APP_BASE_URL", "LEGACY_OWNER_GITHUB_ID"]) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    }
    // The username-based variable is gone, and the E2E-only escape hatch is not offered to deployments.
    expect(example).not.toContain("LEGACY_OWNER_GITHUB_LOGIN");
    expect(example).not.toContain("ALLOW_INSECURE_OAUTH_URLS");
    expect(example).toMatch(/^GITHUB_CLIENT_SECRET=$/m);
    expect(example).toMatch(/^GITHUB_CLIENT_ID=$/m);
  });
});
