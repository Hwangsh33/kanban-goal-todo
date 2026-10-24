import { expect, test, type Page } from "@playwright/test";
import { dragTo, loginAs, selectByText } from "./helpers";

// Pages and API require login: log in through the mock GitHub OAuth flow (e2e/global-setup.ts).
test.beforeEach(async ({ page }) => {
  await loginAs(page, "e2e-kanban");
});

test("goal → weekly plan → todos → drag to done → progress → delete → restore from trash", async ({ page }) => {
  // Unique per test run so repeated runs against the same database do not collide.
  const run = `${Date.now().toString(36)}-${test.info().repeatEachIndex}`;
  const GOAL = `E2E 1년 목표 ${run}`;
  const PLAN = `E2E 주간계획 ${run}`;
  const CARD_1 = `E2E 할 일 1 ${run}`;
  const CARD_2 = `E2E 할 일 2 ${run}`;
  const progressOf = (p: Page) => p.getByRole("progressbar", { name: `${PLAN} 진행률` });

  // 1. Create a goal (year defaults to this week's year).
  await page.goto("/manage");
  const goalForm = page.getByRole("form", { name: "1년 목표 추가" });
  await goalForm.getByLabel("목표 제목").fill(GOAL);
  await goalForm.getByRole("button", { name: "목표 추가" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(GOAL) })).toBeVisible();

  // 2. Create a weekly plan for this week linked to the goal.
  const planForm = page.getByRole("form", { name: "주간계획 추가" });
  await planForm.getByLabel("주간계획 제목").fill(PLAN);
  await selectByText(planForm.getByLabel("1년 목표"), GOAL);
  await planForm.getByRole("button", { name: "주간계획 추가" }).click();
  await expect(progressOf(page)).toHaveAttribute("aria-valuenow", "0");

  // 3. Create two todos linked to the plan (required-field errors first).
  const todoForm = page.getByRole("form", { name: "할 일 추가" });
  await todoForm.getByRole("button", { name: "할 일 추가" }).click();
  await expect(todoForm.getByText("제목을 입력하세요")).toBeVisible();
  await expect(todoForm.getByText("주간계획을 선택하세요")).toBeVisible();
  for (const title of [CARD_1, CARD_2]) {
    await todoForm.getByLabel("할 일 제목").fill(title);
    await selectByText(todoForm.getByRole("combobox", { name: /^주간계획/ }), PLAN);
    await todoForm.getByRole("button", { name: "할 일 추가" }).click();
    await expect(page.locator(".todo-list").getByText(title)).toBeVisible();
  }

  // 4. Board: both cards start in the todo column; drag one to done with the pointer.
  await page.getByRole("link", { name: "대시보드" }).click();
  const todoColumn = page.getByTestId("column-todo");
  const doingColumn = page.getByTestId("column-doing");
  const doneColumn = page.getByTestId("column-done");
  await expect(todoColumn.getByText(CARD_1)).toBeVisible();
  await expect(todoColumn.getByText(CARD_2)).toBeVisible();
  await expect(todoColumn.locator(".badge", { hasText: PLAN }).first()).toBeVisible();

  await dragTo(page, todoColumn.getByText(CARD_1), doneColumn);
  await expect(doneColumn.getByText(CARD_1)).toBeVisible();
  // 5. Progress is updated without a page reload: 1 of 2 done = 50%.
  await expect(progressOf(page)).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator(".plan-progress")).toContainText("50%");

  // Keyboard sensor: pick up with Space, move right, drop with Space → doing (progress unchanged).
  const card2 = todoColumn.locator("li", { hasText: CARD_2 });
  await card2.focus();
  // dnd-kit attaches its key handlers asynchronously, so wait for each live-region announcement.
  const live = page.getByRole("status").filter({ hasText: "카드" });
  await page.keyboard.press("Space");
  // "picked up" is immediately followed by "is over its own place".
  await expect(live).toContainText(`‘${CARD_2}’ 카드가 할 일 컬럼의 ‘${CARD_2}’ 위에 있습니다.`);
  // Droppable rects are measured right after pick-up; an arrow key pressed before that is a no-op.
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect(live).toContainText(/진행 중 컬럼.* 위에 있습니다\./, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(live).toContainText(new RegExp(`‘${CARD_2}’ 카드를 진행 중 컬럼.*에 놓았습니다`));
  await expect(doingColumn.getByText(CARD_2)).toBeVisible();

  // The moves were saved: still there after a reload.
  await page.reload();
  await expect(doneColumn.getByText(CARD_1)).toBeVisible();
  await expect(doingColumn.getByText(CARD_2)).toBeVisible();
  await expect(progressOf(page)).toHaveAttribute("aria-valuenow", "50");

  // 6. Delete the goal: the dialog lists the descendants and needs the exact title.
  await page.goto("/manage");
  const goalCard = page.locator(".goal-card", { hasText: GOAL });
  await goalCard.locator("header").getByRole("button", { name: "삭제" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("하위 주간계획 1개와 할 일 2개");
  const confirm = dialog.getByRole("button", { name: "삭제" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("목표 제목 확인").fill(GOAL);
  await confirm.click();
  await expect(goalCard).toHaveCount(0);

  await page.getByRole("link", { name: "대시보드" }).click();
  await expect(page.getByTestId("week-range")).toBeVisible();
  await expect(progressOf(page)).toHaveCount(0);
  await expect(page.getByText(CARD_1)).toHaveCount(0);

  // 7. Restore from the trash: everything comes back with the same progress.
  await page.getByRole("link", { name: "휴지통" }).click();
  const item = page.locator(".trash-item", { hasText: GOAL });
  await expect(item).toContainText("하위 주간계획 1개, 할 일 2개 포함");
  await item.getByRole("button", { name: "복원" }).click();
  await expect(page.getByRole("status")).toContainText("복원했습니다");
  await expect(item).toHaveCount(0);

  await page.getByRole("link", { name: "대시보드" }).click();
  await expect(progressOf(page)).toHaveAttribute("aria-valuenow", "50");
  await expect(doneColumn.getByText(CARD_1)).toBeVisible();
  await expect(doingColumn.getByText(CARD_2)).toBeVisible();
});
