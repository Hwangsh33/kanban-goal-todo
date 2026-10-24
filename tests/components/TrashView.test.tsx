// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrashView } from "@/components/TrashView";
import { mockFetch } from "../helpers/fetch-mock";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const trash = [
  {
    type: "goal",
    id: "g1",
    title: "책 24권 읽기",
    deletedAt: "2030-03-06T00:00:00.000Z",
    descendants: { weeklyPlans: 1, todos: 2 },
    deletedParent: null,
  },
  {
    type: "todo",
    id: "t1",
    title: "30쪽 읽기",
    deletedAt: "2030-03-05T00:00:00.000Z",
    descendants: {},
    deletedParent: { type: "goal", id: "g1" },
  },
];

describe("TrashView", () => {
  it("shows guidance when restoring an item whose parent is deleted", async () => {
    mockFetch(({ method, url }) => {
      if (method === "GET" && url === "/api/trash") return { body: trash };
      if (method === "POST" && url === "/api/trash/restore") {
        return { status: 409, body: { error: "상위 항목을 먼저 복원하세요", parent: { type: "goal", id: "g1" } } };
      }
      return undefined;
    });
    render(<TrashView />);
    const item = await screen.findByTestId("trash-t1");
    await userEvent.click(within(item).getByRole("button", { name: "복원" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "상위 항목을 먼저 복원하세요 (삭제된 상위 항목: 1년 목표 ‘책 24권 읽기’)",
    );
  });

  it("restores an item and reloads the list", async () => {
    let restored = false;
    const calls = mockFetch(({ method, url }) => {
      if (method === "GET" && url === "/api/trash") return { body: restored ? [trash[1]] : trash };
      if (method === "POST" && url === "/api/trash/restore") {
        restored = true;
        return { body: { restored: true } };
      }
      return undefined;
    });
    render(<TrashView />);
    await userEvent.click(within(await screen.findByTestId("trash-g1")).getByRole("button", { name: "복원" }));
    expect((await screen.findByRole("status")).textContent).toContain("복원했습니다");
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ type: "goal", id: "g1" });
    expect(screen.queryByTestId("trash-g1")).toBeNull();
  });

  it("deletes permanently only after a second confirmation", async () => {
    const calls = mockFetch(({ method, url }) => {
      if (method === "GET" && url === "/api/trash") return { body: trash };
      if (method === "DELETE") return { body: { deleted: true } };
      return undefined;
    });
    render(<TrashView />);
    const item = await screen.findByTestId("trash-g1");
    await userEvent.click(within(item).getByRole("button", { name: "영구 삭제" }));
    await userEvent.click(within(item).getByRole("button", { name: "취소" }));
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);

    await userEvent.click(within(item).getByRole("button", { name: "영구 삭제" }));
    await userEvent.click(within(item).getByRole("button", { name: "영구 삭제 확인" }));
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/trash/goal/g1"]);
  });
});
