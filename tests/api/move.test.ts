import { afterEach, describe, expect, it, vi } from "vitest";
import { Todo } from "@/lib/models";
import { api, seed } from "../helpers/api";
import { setupAuth } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();
setupAuth();

describe("PATCH /api/todos/:id/move", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies a move with a newer seq and records lastSeq", async () => {
    const { todoIds } = await seed({ todos: 1 });
    const res = await api.todos.move(todoIds[0], { status: "doing", seq: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ applied: true, todo: { status: "doing", lastSeq: 1 } });
  });

  it("ignores a stale seq: seq 2 then seq 1 keeps the seq 2 state", async () => {
    const { todoIds } = await seed({ todos: 1 });
    await api.todos.move(todoIds[0], { status: "done", seq: 2 });
    const stale = await api.todos.move(todoIds[0], { status: "doing", seq: 1 });
    expect(stale.status).toBe(200);
    expect(stale.body).toMatchObject({ applied: false, todo: { status: "done", lastSeq: 2 } });
    expect((await api.todos.get(todoIds[0])).body.status).toBe("done");

    const sameSeq = await api.todos.move(todoIds[0], { status: "todo", seq: 2 });
    expect(sameSeq.body.applied).toBe(false);
  });

  it("concurrent requests: only the highest seq wins regardless of arrival order", async () => {
    const { todoIds } = await seed({ todos: 1 });
    await Promise.all([
      api.todos.move(todoIds[0], { status: "done", seq: 3 }),
      api.todos.move(todoIds[0], { status: "doing", seq: 1 }),
      api.todos.move(todoIds[0], { status: "todo", seq: 2 }),
    ]);
    const final = (await api.todos.get(todoIds[0])).body;
    expect(final).toMatchObject({ status: "done", lastSeq: 3 });
  });

  it("only accepts todo|doing|done (400 otherwise) and requires a positive integer seq", async () => {
    const { todoIds } = await seed({ todos: 1 });
    const bad = await api.todos.move(todoIds[0], { status: "archived", seq: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("상태는 todo, doing, done 중 하나여야 합니다");
    expect((await api.todos.move(todoIds[0], { status: "done" })).status).toBe(400);
    expect((await api.todos.move(todoIds[0], { status: "done", seq: 0 })).status).toBe(400);
  });

  it("places the card between neighbours (fractional index) and appends when none are given", async () => {
    const { todoIds } = await seed({ todos: 3 });
    const [a, b, c] = todoIds;
    // All start in "todo" ordered a, b, c. Move c between a and b.
    const res = await api.todos.move(c, { status: "todo", beforeId: a, afterId: b, seq: 1 });
    const orders = Object.fromEntries((await api.todos.list()).body.map((t: { id: string; order: number }) => [t.id, t.order]));
    expect(res.body.todo.order).toBeGreaterThan(orders[a]);
    expect(res.body.todo.order).toBeLessThan(orders[b]);
    expect((await api.todos.list()).body.map((t: { id: string }) => t.id)).toEqual([a, c, b]);

    const appended = await api.todos.move(a, { status: "done", seq: 1 });
    expect(appended.body.todo.status).toBe("done");
  });

  it("renumbers the column when the neighbour gap is below 1e-6", async () => {
    const { todoIds } = await seed({ todos: 3 });
    const [a, b, c] = todoIds;
    await Todo.updateOne({ _id: a }, { order: 1 });
    await Todo.updateOne({ _id: b }, { order: 1 + 5e-7 });
    const res = await api.todos.move(c, { status: "todo", beforeId: a, afterId: b, seq: 1 });
    expect(res.body).toMatchObject({ applied: true, renumbered: true });

    const list = (await api.todos.list()).body as { id: string; order: number }[];
    expect(list.map((t) => t.id)).toEqual([a, c, b]);
    const gaps = list.slice(1).map((t, i) => t.order - list[i].order);
    expect(Math.min(...gaps)).toBeGreaterThan(1);
  });

  it("reports renumbered: false for a move that only changes the moved card", async () => {
    const { todoIds } = await seed({ todos: 2 });
    const res = await api.todos.move(todoIds[0], { status: "doing", seq: 1 });
    expect(res.body).toMatchObject({ applied: true, renumbered: false });
  });

  it("renumbering skips a card that left the column after the orders were computed", async () => {
    const { todoIds } = await seed({ todos: 3 });
    const [a, b, c] = todoIds;
    await Todo.updateOne({ _id: a }, { order: 1 });
    await Todo.updateOne({ _id: b }, { order: 1 + 5e-7 });
    const real = Todo.bulkWrite.bind(Todo);
    vi.spyOn(Todo, "bulkWrite").mockImplementationOnce((async (ops: Parameters<typeof real>[0]) => {
      // A concurrent move takes b to another column just before the renumbering is written.
      await Todo.updateOne({ _id: b }, { status: "done", order: 777 });
      return real(ops);
    }) as never);

    const res = await api.todos.move(c, { status: "todo", beforeId: a, afterId: b, seq: 1 });
    expect(res.body).toMatchObject({ applied: true, renumbered: true });
    expect((await api.todos.get(b)).body).toMatchObject({ status: "done", order: 777 });
  });

  it("rejects an unknown neighbour with 400 and unknown todos with 404", async () => {
    const { todoIds } = await seed({ todos: 1 });
    const res = await api.todos.move(todoIds[0], { status: "todo", beforeId: "000000000000000000000000", seq: 1 });
    expect(res.status).toBe(400);
    expect((await api.todos.move("000000000000000000000000", { status: "todo", seq: 1 })).status).toBe(404);
  });
});
