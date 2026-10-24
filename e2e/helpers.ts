import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Logs in through the real flow: /login → /auth/github → mock GitHub consent page → callback → /.
 * `login` is one of MOCK_GITHUB_USERS (e2e/mock-github.ts).
 */
export async function loginAs(page: Page, login: string) {
  await page.goto("/login");
  await page.getByRole("link", { name: "GitHub 로 로그인" }).click();
  await page.getByRole("link", { name: `Sign in as ${login}` }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).getByText(login, { exact: true })).toBeVisible();
}

/** Same-origin fetch from the page, so it carries exactly the browser's cookies. */
export async function api(page: Page, method: string, url: string): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ([m, u]) => {
      const res = await fetch(u, { method: m });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    [method, url] as const,
  );
}

/** Pointer drag with intermediate moves so dnd-kit's PointerSensor (5px activation) picks it up. */
export async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

export async function selectByText(select: Locator, text: string) {
  const value = await select.locator("option", { hasText: text }).getAttribute("value");
  await select.selectOption(value!);
}
