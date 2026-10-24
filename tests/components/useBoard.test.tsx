// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardData, TodoDto } from "@/lib/client/api";
import { useBoard } from "@/lib/client/useBoard";
import { deferred, mockFetch, type Call } from "../helpers/fetch-mock";

afterEach(() => {
  vi.unstubAllGlobals();
});

function todo(id: string, status: TodoDto["status"], order: number, lastSeq = 0): TodoDto {
  return { id, title: id, status, date: "2030-03-04", dueDate: null, order, lastSeq, weeklyPlanId: "p1", deletedAt: null };
}

function board(todos: TodoDto[]): BoardData {
  return {
    weekStart: "2030-03-04",
    weekEnd: "2030-03-10",
    plans: [
      { id: "p1", title: "계획", weekStart: "2030-03-04", goalId: "g1", deletedAt: null, progress: { done: 0, total: 2, percent: 0 } },
    ],
    todos,
    previousWeekIncomplete: 0,
  };
}

type Reply = { status?: number; body: unknown };

async function setup(todos: TodoDto[], onMove: (call: Call) => Reply | Promise<Reply>) {
  const calls = mockFetch((call) => {
    if (call.url.startsWith("/api/board")) return { body: board(todos) };
    if (call.url.endsWith("/move")) return onMove(call);
    if (call.url === "/api/weekly-plans/p1/progress") return { body: { done: 1, total: 2, percent: 50 } };
    return undefined;
  });
  const hook = renderHook(() => useBoard("2030-03-04"));
  await waitFor(() => expect(hook.result.current.data).not.toBeNull());
  return { calls, result: hook.result };
}

const ids = (list: TodoDto[] | undefined) => list?.map((t) => t.id);

describe("useBoard optimistic moves", () => {
  it("moves the card immediately, then rolls back and raises a toast when the API fails", async () => {
    const reply = deferred<Reply>();
    const { result } = await setup([todo("a", "todo", 1024), todo("b", "todo", 2048)], () => reply.promise);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.moveCard("a", "done", 0);
    });
    // Optimistic: already in the done column while the request is in flight.
    expect(ids(result.current.columns?.done)).toEqual(["a"]);
    expect(ids(result.current.columns?.todo)).toEqual(["b"]);

    await act(async () => {
      reply.resolve({ status: 500, body: { error: "서버 오류가 발생했습니다" } });
      await pending;
    });
    expect(ids(result.current.columns?.todo)).toEqual(["a", "b"]);
    expect(ids(result.current.columns?.done)).toEqual([]);
    expect(result.current.toast).toBe("이동에 실패해 되돌렸습니다: 서버 오류가 발생했습니다");
  });

  it("starts seq from the card's lastSeq and increments it per request; refreshes plan progress", async () => {
    const { calls, result } = await setup([todo("a", "todo", 1024, 7), todo("b", "todo", 2048)], ({ url, body }) => {
      const input = body as { status: TodoDto["status"]; seq: number };
      return { body: { applied: true, todo: { ...todo(url.split("/")[3], input.status, 4096), lastSeq: input.seq } } };
    });

    await act(() => result.current.moveCard("a", "doing", 0));
    await act(() => result.current.moveCard("a", "done", 0));
    await act(() => result.current.moveCard("b", "done", 0));

    const moves = calls.filter((c) => c.url.endsWith("/move"));
    expect(moves.map((c) => [c.url, (c.body as { seq: number }).seq])).toEqual([
      ["/api/todos/a/move", 8],
      ["/api/todos/a/move", 9],
      ["/api/todos/b/move", 1],
    ]);
    // b is dropped above a in the done column.
    expect(moves[2].body).toMatchObject({ status: "done", beforeId: null, afterId: "a" });
    expect(result.current.data?.plans[0].progress).toEqual({ done: 1, total: 2, percent: 50 });
  });

  it("resets the card to the server state when the move is stale (applied: false)", async () => {
    const server = { ...todo("a", "doing", 512), lastSeq: 20 };
    const { result } = await setup([todo("a", "todo", 1024, 3)], () => ({ body: { applied: false, todo: server } }));

    await act(() => result.current.moveCard("a", "done", 0));
    expect(result.current.data?.todos).toEqual([server]);
    expect(result.current.toast).toBeNull();
  });

  it("does not roll back an older failed move over a newer one", async () => {
    const first = deferred<Reply>();
    let n = 0;
    const { result } = await setup([todo("a", "todo", 1024)], ({ body }) => {
      n += 1;
      if (n === 1) return first.promise;
      const input = body as { status: TodoDto["status"]; seq: number };
      return { body: { applied: true, todo: { ...todo("a", input.status, 1024), lastSeq: input.seq } } };
    });

    let older!: Promise<void>;
    act(() => {
      older = result.current.moveCard("a", "doing", 0);
    });
    await act(() => result.current.moveCard("a", "done", 0));
    await act(async () => {
      first.resolve({ status: 500, body: { error: "실패" } });
      await older;
    });
    expect(ids(result.current.columns?.done)).toEqual(["a"]);
    expect(result.current.toast).toBeNull();
  });

  it("reloads the board when the server renumbered the column", async () => {
    const initial = [todo("a", "todo", 1), todo("b", "todo", 1.0000005), todo("c", "todo", 2048)];
    const renumbered = [todo("a", "todo", 1024), todo("c", "todo", 2048), todo("b", "todo", 3072)];
    let boards = 0;
    const calls = mockFetch((call) => {
      if (call.url.startsWith("/api/board")) {
        boards += 1;
        return { body: board(boards === 1 ? initial : renumbered) };
      }
      if (call.url.endsWith("/move")) return { body: { applied: true, renumbered: true, todo: { ...todo("c", "todo", 1536), lastSeq: 1 } } };
      if (call.url === "/api/weekly-plans/p1/progress") return { body: { done: 0, total: 3, percent: 0 } };
      return undefined;
    });
    const { result } = renderHook(() => useBoard("2030-03-04"));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(() => result.current.moveCard("c", "todo", 1));
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith("/api/board"))).toHaveLength(2));
    await waitFor(() => expect(ids(result.current.columns?.todo)).toEqual(["a", "c", "b"]));
    expect(result.current.data?.todos.map((t) => t.order)).toEqual([1024, 2048, 3072]);
  });

  it("does not reload the board for a move without renumbering", async () => {
    const { calls, result } = await setup([todo("a", "todo", 1024), todo("b", "todo", 2048)], ({ body }) => {
      const input = body as { status: TodoDto["status"]; seq: number };
      return { body: { applied: true, renumbered: false, todo: { ...todo("a", input.status, 3072), lastSeq: input.seq } } };
    });
    await act(() => result.current.moveCard("a", "done", 0));
    expect(calls.filter((c) => c.url.startsWith("/api/board"))).toHaveLength(1);
  });

  it("ignores a drop at the card's current position", async () => {
    const { calls, result } = await setup([todo("a", "todo", 1024), todo("b", "todo", 2048)], () => ({ body: {} }));
    await act(() => result.current.moveCard("b", "todo", 1));
    expect(calls.filter((c) => c.url.endsWith("/move"))).toEqual([]);
  });
});
