import { expect, test, type Page } from "@playwright/test";
import { SESSION_COOKIE } from "../lib/auth/cookies";
import { api, dragTo, loginAs, selectByText } from "./helpers";

// Every test here starts logged out (fresh browser context, no seeded session) and logs in through
// /auth/github → mock GitHub (e2e/mock-github.ts) → /auth/github/callback.

const nav = (page: Page) => page.getByRole("navigation", { name: "주 메뉴" });

test("logged-out visitors are sent to /login; cancelling on GitHub shows a Korean message", async ({ page }) => {
  await page.goto("/manage");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(nav(page).getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  expect((await api(page, "GET", "/api/goals")).status).toBe(401);

  await page.getByRole("link", { name: "GitHub 로 로그인" }).click();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL("/login?error=denied");
  await expect(page.locator("main").getByRole("alert")).toHaveText("GitHub 로그인이 취소되었습니다. 다시 시도해 주세요.");
  expect((await api(page, "GET", "/api/goals")).status).toBe(401);
});

test("GitHub login → own data only → logout (401 + /login) → login again → kanban still works", async ({ page, browser, baseURL }) => {
  const run = `${Date.now().toString(36)}-${test.info().repeatEachIndex}`;
  const GOAL = `A 목표 ${run}`;
  const PLAN = `A 주간계획 ${run}`;
  const CARD = `A 할 일 ${run}`;

  // 1. User A logs in with GitHub: the nav shows the GitHub username and avatar.
  await loginAs(page, "e2e-alice");
  const avatar = nav(page).getByRole("img", { name: "e2e-alice 아바타" });
  await expect(avatar).toBeVisible();
  expect(await avatar.getAttribute("src")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/avatars\/e2e-alice\.png$/);
  // Already logged in → /login sends you back to the board.
  await page.goto("/login");
  await expect(page).toHaveURL("/");

  // 2. A creates a goal, a weekly plan and a todo.
  await page.goto("/manage");
  const goalForm = page.getByRole("form", { name: "1년 목표 추가" });
  await goalForm.getByLabel("목표 제목").fill(GOAL);
  await goalForm.getByRole("button", { name: "목표 추가" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(GOAL) })).toBeVisible();
  const planForm = page.getByRole("form", { name: "주간계획 추가" });
  await planForm.getByLabel("주간계획 제목").fill(PLAN);
  await selectByText(planForm.getByLabel("1년 목표"), GOAL);
  await planForm.getByRole("button", { name: "주간계획 추가" }).click();
  const todoForm = page.getByRole("form", { name: "할 일 추가" });
  await todoForm.getByLabel("할 일 제목").fill(CARD);
  await selectByText(todoForm.getByRole("combobox", { name: /^주간계획/ }), PLAN);
  await todoForm.getByRole("button", { name: "할 일 추가" }).click();
  await expect(page.locator(".todo-list").getByText(CARD)).toBeVisible();

  const find = async (url: string, title: string) => {
    const { status, body } = await api(page, "GET", url);
    expect(status).toBe(200);
    return (body as { id: string; title: string }[]).find((x) => x.title === title)!.id;
  };
  const ids = {
    goal: await find("/api/goals", GOAL),
    plan: await find("/api/weekly-plans", PLAN),
    todo: await find("/api/todos", CARD),
  };

  // 3. User B logs in in a separate browser (own cookies) and sees none of A's data.
  const contextB = await browser.newContext({ baseURL });
  const pageB = await contextB.newPage();
  await loginAs(pageB, "e2e-bob");
  await pageB.goto("/manage");
  await expect(pageB.getByText("아직 1년 목표가 없습니다")).toBeVisible();
  await expect(pageB.getByText(GOAL)).toHaveCount(0);
  await expect(pageB.getByText(CARD)).toHaveCount(0);
  for (const url of ["/api/goals", "/api/weekly-plans", "/api/todos"]) {
    expect(await api(pageB, "GET", url)).toEqual({ status: 200, body: [] });
  }
  // A's ids do not exist for B (404, not 403): read, progress and delete.
  for (const [method, url] of [
    ["GET", `/api/goals/${ids.goal}`],
    ["GET", `/api/goals/${ids.goal}/progress`],
    ["GET", `/api/weekly-plans/${ids.plan}`],
    ["GET", `/api/todos/${ids.todo}`],
    ["DELETE", `/api/todos/${ids.todo}`],
    ["DELETE", `/api/goals/${ids.goal}`],
  ] as const) {
    expect({ method, url, status: (await api(pageB, method, url)).status }).toEqual({ method, url, status: 404 });
  }
  await contextB.close();
  // B's delete attempts changed nothing for A.
  expect((await api(page, "GET", `/api/todos/${ids.todo}`)).status).toBe(200);
  expect((await api(page, "GET", `/api/goals/${ids.goal}`)).status).toBe(200);

  // 4. A logs out: the session is deleted on the server and the cookie expires.
  const oldToken = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE)!.value;
  await nav(page).getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL("/login");
  expect((await page.context().cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);
  await page.goto("/manage");
  await expect(page).toHaveURL("/login");
  expect(await api(page, "GET", "/api/goals")).toEqual({ status: 401, body: { error: "로그인이 필요합니다" } });
  // Replaying the old cookie does not work either: the DB session is gone.
  await page.context().addCookies([{ name: SESSION_COOKIE, value: oldToken, url: baseURL!, secure: true, httpOnly: true }]);
  expect((await api(page, "GET", "/api/goals")).status).toBe(401);
  await page.goto("/manage");
  await expect(page).toHaveURL("/login");

  // 5. A logs in again: the data is still A's.
  await loginAs(page, "e2e-alice");
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: new RegExp(GOAL) })).toBeVisible();

  // 6. Kanban with the OAuth session: drag to done updates progress (full flow in flow.spec.ts).
  await nav(page).getByRole("link", { name: "대시보드" }).click();
  const progress = page.getByRole("progressbar", { name: `${PLAN} 진행률` });
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await dragTo(page, page.getByTestId("column-todo").getByText(CARD), page.getByTestId("column-done"));
  await expect(page.getByTestId("column-done").getByText(CARD)).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
});
