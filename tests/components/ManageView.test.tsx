// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManageView } from "@/components/ManageView";
import { mockFetch } from "../helpers/fetch-mock";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const goal = { id: "g1", title: "책 24권 읽기", year: 2030, deletedAt: null, progress: { done: 1, total: 4, percent: 25 } };
const plan = {
  id: "p1",
  title: "독서 주간",
  weekStart: "2030-03-04",
  goalId: "g1",
  deletedAt: null,
  progress: { done: 1, total: 4, percent: 25 },
};

function routes() {
  return mockFetch(({ method, url }) => {
    if (method === "GET" && url === "/api/goals") return { body: [goal] };
    if (method === "GET" && url === "/api/weekly-plans") return { body: [plan] };
    if (method === "GET" && url === "/api/todos") return { body: [] };
    if (method === "GET" && url === "/api/goals/g1") return { body: { ...goal, descendants: { weeklyPlans: 1, todos: 4 } } };
    if (method === "GET" && url === "/api/weekly-plans/p1") return { body: { ...plan, descendants: { todos: 4 } } };
    if (method === "DELETE") return { body: { descendants: {} } };
    return undefined;
  });
}

describe("ManageView", () => {
  it("shows a progress bar with % on weekly plan cards", async () => {
    routes();
    render(<ManageView thisWeek="2030-03-04" thisYear={2030} />);
    const bar = await screen.findByRole("progressbar", { name: "독서 주간 진행률" });
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(within(screen.getByTestId("plan-p1")).getByText(/25%/)).toBeTruthy();
  });

  it("cancelling the delete dialog sends no DELETE request and keeps the item", async () => {
    const calls = routes();
    render(<ManageView thisWeek="2030-03-04" thisYear={2030} />);
    const card = await screen.findByTestId("plan-p1");
    await userEvent.click(within(card).getByRole("button", { name: "삭제" }));

    const dialog = await screen.findByRole("dialog");
    expect((await within(dialog).findByTestId("descendant-info")).textContent).toContain("하위 할 일 4개");
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
    expect(screen.getByTestId("plan-p1")).toBeTruthy();
  });

  it("deletes a goal only after its exact title is typed", async () => {
    const calls = routes();
    render(<ManageView thisWeek="2030-03-04" thisYear={2030} />);
    const card = await screen.findByTestId("goal-g1");
    await userEvent.click(within(card).getAllByRole("button", { name: "삭제" })[0]);

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByTestId("descendant-info");
    const confirm = within(dialog).getByRole("button", { name: "삭제" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText("목표 제목 확인"), "책 24권 읽기");
    await userEvent.click(confirm);

    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/goals/g1"]);
  });
});
