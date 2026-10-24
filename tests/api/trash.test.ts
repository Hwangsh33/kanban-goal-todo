import { describe, expect, it } from "vitest";
import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import { deleteGoal } from "@/lib/repo/goals";
import { listTrash, purgeExpired } from "@/lib/repo/trash";
import { deleteTodo } from "@/lib/repo/todos";
import { deleteWeeklyPlan } from "@/lib/repo/weeklyPlans";
import { api, seed } from "../helpers/api";
import { setupAuth } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();
const auth = setupAuth();

const DAY = 86_400_000;

async function markDone(todoId: string, seq = 1) {
  const res = await api.todos.move(todoId, { status: "done", seq });
  expect(res.status).toBe(200);
}

describe("root tombstone deletion", () => {
  it("writes deletedAt on the root only and leaves descendants untouched", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 2 });
    const res = await api.goals.remove(goalId);
    expect(res.status).toBe(200);
    expect(res.body.descendants).toEqual({ weeklyPlans: 1, todos: 2 });

    expect((await Goal.findById(goalId).lean())!.deletedAt).toBeInstanceOf(Date);
    expect((await WeeklyPlan.findById(planId).lean())!.deletedAt).toBeNull();
    const todos = await Todo.find({ _id: { $in: todoIds } }).lean();
    expect(todos.every((t) => t.deletedAt === null)).toBe(true);
  });

  it("offers descendant counts before deleting (GET) and in the DELETE response", async () => {
    const { goalId, planId } = await seed({ todos: 3 });
    expect((await api.goals.get(goalId)).body.descendants).toEqual({ weeklyPlans: 1, todos: 3 });
    expect((await api.plans.get(planId)).body.descendants).toEqual({ todos: 3 });
    expect((await api.plans.remove(planId)).body.descendants).toEqual({ todos: 3 });
  });

  it("hides the goal and all descendants from lists, board and progress", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 2 });
    await api.goals.remove(goalId);

    expect((await api.goals.list()).body).toEqual([]);
    expect((await api.plans.list()).body).toEqual([]);
    expect((await api.todos.list()).body).toEqual([]);
    expect((await api.plans.get(planId)).status).toBe(404);
    expect((await api.plans.progress(planId)).status).toBe(404);
    expect((await api.todos.get(todoIds[0])).status).toBe(404);
    const board = await api.board("?week=2030-03-04");
    expect(board.body.plans).toEqual([]);
    expect(board.body.todos).toEqual([]);
    // Hidden descendants cannot be modified either.
    expect((await api.todos.update(todoIds[0], { title: "x" })).status).toBe(404);
    expect((await api.todos.create({ title: "x", weeklyPlanId: planId })).status).toBe(400);
  });
});

describe("restore", () => {
  it("restoring a goal brings back plans, todos and the exact same progress", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 4 });
    await markDone(todoIds[0]);
    const before = {
      plan: (await api.plans.progress(planId)).body,
      goal: (await api.goals.progress(goalId)).body,
    };
    expect(before.plan).toEqual({ done: 1, total: 4, percent: 25 });

    await api.goals.remove(goalId);
    expect((await api.goals.progress(goalId)).status).toBe(404);

    const restored = await api.trash.restore({ type: "goal", id: goalId });
    expect(restored.status).toBe(200);
    expect((await api.plans.progress(planId)).body).toEqual(before.plan);
    expect((await api.goals.progress(goalId)).body).toEqual(before.goal);
    expect((await api.todos.list(`?weeklyPlanId=${planId}`)).body).toHaveLength(4);
  });

  it("refuses (409) restoring a child while its parent is deleted, then allows it after the parent", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 1 });
    await api.todos.remove(todoIds[0]);
    await api.plans.remove(planId);
    await api.goals.remove(goalId);

    const plan = await api.trash.restore({ type: "weeklyPlan", id: planId });
    expect(plan.status).toBe(409);
    expect(plan.body).toMatchObject({ error: "상위 항목을 먼저 복원하세요", parent: { type: "goal", id: goalId } });

    const todo = await api.trash.restore({ type: "todo", id: todoIds[0] });
    expect(todo.status).toBe(409);
    expect(todo.body.parent).toEqual({ type: "weeklyPlan", id: planId });

    expect((await api.trash.restore({ type: "goal", id: goalId })).status).toBe(200);
    // Separately deleted children stay in the trash until restored themselves.
    expect((await api.plans.get(planId)).status).toBe(404);
    expect((await api.trash.restore({ type: "weeklyPlan", id: planId })).status).toBe(200);
    expect((await api.trash.restore({ type: "todo", id: todoIds[0] })).status).toBe(200);
    expect((await api.todos.get(todoIds[0])).status).toBe(200);
  });

  it("refuses restoring a todo whose plan is active but whose goal is deleted", async () => {
    const { goalId, todoIds } = await seed({ todos: 1 });
    await api.todos.remove(todoIds[0]);
    await api.goals.remove(goalId);
    const res = await api.trash.restore({ type: "todo", id: todoIds[0] });
    expect(res.status).toBe(409);
    expect(res.body.parent).toEqual({ type: "goal", id: goalId });
  });

  it("returns 404 for items that are not in the trash and 400 for an invalid type", async () => {
    const { goalId } = await seed();
    expect((await api.trash.restore({ type: "goal", id: goalId })).status).toBe(404);
    expect((await api.trash.restore({ type: "nope", id: goalId })).status).toBe(400);
  });
});

describe("GET /api/trash", () => {
  it("lists deleted roots with descendant counts and the blocking parent", async () => {
    const { goalId, todoIds } = await seed({ todos: 2 });
    await api.todos.remove(todoIds[0]);
    await api.goals.remove(goalId);

    const res = await api.trash.list();
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(res.body.map((i: { type: string }) => [i.type, i]));
    expect(byType.goal).toMatchObject({ id: goalId, descendants: { weeklyPlans: 1, todos: 1 }, deletedParent: null });
    expect(byType.todo).toMatchObject({ id: todoIds[0], deletedParent: { type: "goal", id: goalId } });
  });
});

describe("DELETE /api/trash/:type/:id (permanent delete)", () => {
  it("hard-deletes a trashed goal with all plans and todos, including separately trashed ones", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 2 });
    const other = await seed({ todos: 1 });
    await api.todos.remove(todoIds[0]);
    await api.goals.remove(goalId);

    const res = await api.trash.purge("goal", goalId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: "goal", id: goalId, deleted: true });
    expect(await Goal.exists({ _id: goalId })).toBeNull();
    expect(await WeeklyPlan.exists({ _id: planId })).toBeNull();
    expect(await Todo.countDocuments({ _id: { $in: todoIds } })).toBe(0);
    // Unrelated data is untouched and the trash is empty.
    expect(await Todo.countDocuments({ _id: other.todoIds[0] })).toBe(1);
    expect((await api.trash.list()).body).toEqual([]);
  });

  it("hard-deletes a trashed plan with its todos but keeps the goal", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 2 });
    await api.plans.remove(planId);
    expect((await api.trash.purge("weeklyPlan", planId)).status).toBe(200);
    expect(await WeeklyPlan.exists({ _id: planId })).toBeNull();
    expect(await Todo.countDocuments({ _id: { $in: todoIds } })).toBe(0);
    expect((await api.goals.get(goalId)).status).toBe(200);
  });

  it("hard-deletes a single trashed todo even while its parent is deleted", async () => {
    const { goalId, todoIds } = await seed({ todos: 2 });
    await api.todos.remove(todoIds[0]);
    await api.goals.remove(goalId);
    expect((await api.trash.purge("todo", todoIds[0])).status).toBe(200);
    expect(await Todo.exists({ _id: todoIds[0] })).toBeNull();
    expect(await Todo.exists({ _id: todoIds[1] })).not.toBeNull();
  });

  it("refuses items that are not in the trash (404) and invalid types (400)", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 1 });
    expect((await api.trash.purge("goal", goalId)).status).toBe(404);
    expect((await api.trash.purge("weeklyPlan", planId)).status).toBe(404);
    expect((await api.trash.purge("todo", todoIds[0])).status).toBe(404);
    // A descendant hidden through its deleted parent is not itself a trash item.
    await api.goals.remove(goalId);
    expect((await api.trash.purge("weeklyPlan", planId)).status).toBe(404);
    expect((await api.trash.purge("todo", "not-an-id")).status).toBe(404);
    expect((await api.trash.purge("nope", goalId)).status).toBe(400);
    expect(await Todo.exists({ _id: todoIds[0] })).not.toBeNull();
  });
});

describe("30-day purge (injected clock, idempotent)", () => {
  it("hard-deletes roots older than 30 days with their descendants, keeps newer ones", async () => {
    const now = new Date("2030-06-01T00:00:00Z");
    const old = await seed({ todos: 2 });
    const oldPlanOnly = await seed({ todos: 1 });
    const oldTodo = await seed({ todos: 1 });
    const fresh = await seed({ todos: 1 });

    await deleteGoal(auth.userId, old.goalId, new Date(now.getTime() - 31 * DAY));
    await deleteWeeklyPlan(auth.userId, oldPlanOnly.planId, new Date(now.getTime() - 30 * DAY - 1));
    await deleteTodo(auth.userId, oldTodo.todoIds[0], new Date(now.getTime() - 40 * DAY));
    await deleteGoal(auth.userId, fresh.goalId, new Date(now.getTime() - 29 * DAY));

    const first = await purgeExpired(auth.userId, now);
    expect(first).toEqual({ goals: 1, weeklyPlans: 2, todos: 1 });
    expect(await Goal.exists({ _id: old.goalId })).toBeNull();
    expect(await WeeklyPlan.exists({ _id: old.planId })).toBeNull();
    expect(await Todo.countDocuments({ _id: { $in: [...old.todoIds, ...oldPlanOnly.todoIds, ...oldTodo.todoIds] } })).toBe(0);
    expect(await Goal.exists({ _id: oldPlanOnly.goalId })).not.toBeNull();
    expect(await Goal.exists({ _id: fresh.goalId })).not.toBeNull();
    expect(await Todo.countDocuments({ _id: fresh.todoIds[0] })).toBe(1);

    const second = await purgeExpired(auth.userId, now);
    expect(second).toEqual({ goals: 0, weeklyPlans: 0, todos: 0 });

    const trash = await listTrash(auth.userId, now);
    expect(trash.map((i) => i.id)).toEqual([fresh.goalId]);
  });
});
