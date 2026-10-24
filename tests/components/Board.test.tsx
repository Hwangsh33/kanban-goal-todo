// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board } from "@/components/Board";
import { mockFetch } from "../helpers/fetch-mock";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function boardFor(url: string) {
  const week = new URL(url, "http://x").searchParams.get("week") ?? "2030-03-04";
  if (week === "2030-02-25") {
    return { weekStart: week, weekEnd: "2030-03-03", plans: [], todos: [], previousWeekIncomplete: 0 };
  }
  return {
    weekStart: "2030-03-04",
    weekEnd: "2030-03-10",
    plans: [
      { id: "p1", title: "독서 주간", weekStart: "2030-03-04", goalId: "g1", deletedAt: null, progress: { done: 1, total: 2, percent: 50 } },
      { id: "p2", title: "운동 주간", weekStart: "2030-03-04", goalId: "g2", deletedAt: null, progress: { done: 0, total: 1, percent: 0 } },
    ],
    todos: [
      { id: "t1", title: "30쪽 읽기", status: "todo", date: "2030-03-05", dueDate: null, order: 1, lastSeq: 0, weeklyPlanId: "p1", deletedAt: null },
      { id: "t2", title: "서평 쓰기", status: "done", date: "2030-03-04", dueDate: null, order: 2, lastSeq: 0, weeklyPlanId: "p1", deletedAt: null },
      { id: "t3", title: "달리기", status: "doing", date: "2030-03-06", dueDate: null, order: 3, lastSeq: 0, weeklyPlanId: "p2", deletedAt: null },
    ],
    previousWeekIncomplete: 2,
  };
}

describe("Board", () => {
  it("renders three columns with plan badges, plan progress and keyboard-draggable cards", async () => {
    mockFetch(({ url }) => (url.startsWith("/api/board") ? { body: boardFor(url) } : undefined));
    render(<Board initialWeek="2030-03-04" />);

    const todoCol = await screen.findByTestId("column-todo");
    const card = within(todoCol).getByTestId("card-t1");
    expect(within(card).getByText("독서 주간")).toBeTruthy(); // plan badge
    expect(within(card).getByText("2030-03-05 (화)")).toBeTruthy();
    expect(within(screen.getByTestId("column-doing")).getByText("달리기")).toBeTruthy();
    expect(within(screen.getByTestId("column-done")).getByText("서평 쓰기")).toBeTruthy();
    // dnd-kit sortable attributes make cards focusable for the keyboard sensor.
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.getAttribute("aria-roledescription")).toBe("sortable");
    expect(screen.getByRole("progressbar", { name: "독서 주간 진행률" }).getAttribute("aria-valuenow")).toBe("50");
  });

  it("passes the plan filter and weekday tab to the board API", async () => {
    const calls = mockFetch(({ url }) => (url.startsWith("/api/board") ? { body: boardFor(url) } : undefined));
    render(<Board initialWeek="2030-03-04" />);
    await screen.findByTestId("card-t1");

    await userEvent.selectOptions(screen.getByLabelText("주간계획 필터"), "p2");
    await userEvent.click(screen.getByRole("button", { name: "수" }));
    const last = calls.at(-1)!.url;
    expect(last).toBe("/api/board?week=2030-03-04&weeklyPlanId=p2&day=wed");
    expect(screen.getByRole("button", { name: "수" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the previous-week incomplete badge and moves to the previous week on click", async () => {
    const calls = mockFetch(({ url }) => (url.startsWith("/api/board") ? { body: boardFor(url) } : undefined));
    render(<Board initialWeek="2030-03-04" />);
    await userEvent.click(await screen.findByRole("button", { name: "지난 주 미완료 2건" }));

    expect(calls.at(-1)!.url).toBe("/api/board?week=2030-02-25");
    expect((await screen.findByTestId("week-range")).textContent).toBe("2030-02-25 ~ 2030-03-03");
  });

  it("navigates to the next week", async () => {
    const calls = mockFetch(({ url }) => (url.startsWith("/api/board") ? { body: boardFor(url) } : undefined));
    render(<Board initialWeek="2030-03-04" />);
    await screen.findByTestId("card-t1");
    await userEvent.click(screen.getByRole("button", { name: "다음 주" }));
    expect(calls.at(-1)!.url).toBe("/api/board?week=2030-03-11");
  });
});
