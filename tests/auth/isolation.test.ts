import { beforeEach, describe, expect, it } from "vitest";
import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import { apiAs, seed, type ApiClient } from "../helpers/api";
import { createTestUser, type TestUser } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();

const WEEK = "2030-03-04";
let alice: TestUser;
let bob: TestUser;
let A: ApiClient;
let B: ApiClient;
let a: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  alice = await createTestUser("alice");
  bob = await createTestUser("bob");
  A = apiAs(alice.cookie);
  B = apiAs(bob.cookie);
  a = await seed({ todos: 2 }, A);
  await A.todos.move(a.todoIds[0], { status: "done", seq: 1 });
});

/** Alice's data as she sees it; must be identical before and after Bob's attempts. */
async function aliceView() {
  return {
    goals: (await A.goals.list()).body,
    plans: (await A.plans.list()).body,
    todos: (await A.todos.list()).body,
    board: (await A.board(`?week=${WEEK}`)).body,
    trash: (await A.trash.list()).body,
  };
}

describe("creation records the owner", () => {
  it("goals, weekly plans and todos get the creating user's id", async () => {
    expect(String((await Goal.findById(a.goalId).lean())!.userId)).toBe(String(alice.userId));
    expect(String((await WeeklyPlan.findById(a.planId).lean())!.userId)).toBe(String(alice.userId));
    const todos = await Todo.find({ _id: { $in: a.todoIds } }).lean();
    expect(todos.map((t) => String(t.userId))).toEqual([String(alice.userId), String(alice.userId)]);
  });

  it("a userId in the request body is ignored (owner always comes from the session)", async () => {
    const goal = await B.goals.create({ title: "주입", year: 2030, userId: String(alice.userId) });
    expect(goal.status).toBe(201);
    expect(String((await Goal.findById(goal.body.id).lean())!.userId)).toBe(String(bob.userId));
    await B.goals.update(goal.body.id, { title: "주입2", userId: String(alice.userId) });
    expect(String((await Goal.findById(goal.body.id).lean())!.userId)).toBe(String(bob.userId));
    const plan = await B.plans.create({ title: "p", weekStart: WEEK, goalId: goal.body.id, userId: String(alice.userId) });
    const todo = await B.todos.create({ title: "t", weeklyPlanId: plan.body.id, userId: String(alice.userId) });
    expect(String((await WeeklyPlan.findById(plan.body.id).lean())!.userId)).toBe(String(bob.userId));
    expect(String((await Todo.findById(todo.body.id).lean())!.userId)).toBe(String(bob.userId));
    expect((await A.goals.list()).body.map((g: { title: string }) => g.title)).toEqual(["목표"]);
  });
});

describe("another user's data is invisible", () => {
  it("lists, board, progress and trash of B do not contain A's data", async () => {
    expect((await B.goals.list()).body).toEqual([]);
    expect((await B.plans.list()).body).toEqual([]);
    expect((await B.plans.list(`?goalId=${a.goalId}`)).body).toEqual([]);
    expect((await B.todos.list()).body).toEqual([]);
    expect((await B.todos.list(`?weeklyPlanId=${a.planId}`)).body).toEqual([]);
    const board = await B.board(`?week=${WEEK}`);
    expect(board.body).toMatchObject({ plans: [], todos: [], previousWeekIncomplete: 0 });
    expect((await B.board(`?week=${WEEK}&weeklyPlanId=${a.planId}`)).body.todos).toEqual([]);

    await A.todos.remove(a.todoIds[1]);
    expect((await A.trash.list()).body).toHaveLength(1);
    expect((await B.trash.list()).body).toEqual([]);
  });

  it("B's own data does not change A's lists or progress", async () => {
    const before = await aliceView();
    const b = await seed({ todos: 3 }, B);
    await B.todos.move(b.todoIds[0], { status: "done", seq: 1 });
    expect(await aliceView()).toEqual(before);
    expect((await B.plans.progress(b.planId)).body).toEqual({ done: 1, total: 3, percent: 33 });
    expect((await A.plans.progress(a.planId)).body).toEqual({ done: 1, total: 2, percent: 50 });
  });
});

describe("B using A's ids gets 404 on every endpoint and changes nothing", () => {
  it("GET / PATCH / DELETE / progress / move", async () => {
    const before = await aliceView();
    const [todoId] = a.todoIds;
    const results = {
      getGoal: await B.goals.get(a.goalId),
      patchGoal: await B.goals.update(a.goalId, { title: "탈취" }),
      goalProgress: await B.goals.progress(a.goalId),
      getPlan: await B.plans.get(a.planId),
      patchPlan: await B.plans.update(a.planId, { title: "탈취" }),
      planProgress: await B.plans.progress(a.planId),
      getTodo: await B.todos.get(todoId),
      patchTodo: await B.todos.update(todoId, { title: "탈취" }),
      move: await B.todos.move(todoId, { status: "doing", seq: 99 }),
      deleteTodo: await B.todos.remove(todoId),
      deletePlan: await B.plans.remove(a.planId),
      deleteGoal: await B.goals.remove(a.goalId),
    };
    for (const [name, res] of Object.entries(results)) {
      expect({ name, status: res.status }).toEqual({ name, status: 404 });
    }
    expect(await aliceView()).toEqual(before);
  });

  it("trash restore and permanent delete", async () => {
    await A.todos.remove(a.todoIds[1]);
    await A.goals.remove(a.goalId);
    const before = await aliceView();
    for (const [type, id] of [["goal", a.goalId], ["todo", a.todoIds[1]]] as const) {
      expect((await B.trash.restore({ type, id })).status).toBe(404);
      expect((await B.trash.purge(type, id)).status).toBe(404);
    }
    expect(await aliceView()).toEqual(before);
    expect(await Goal.exists({ _id: a.goalId })).not.toBeNull();
    expect(await Todo.exists({ _id: a.todoIds[1] })).not.toBeNull();
    // A can still restore her own goal.
    expect((await A.trash.restore({ type: "goal", id: a.goalId })).status).toBe(200);
  });
});

describe("no cross-user references", () => {
  it("B cannot create a weekly plan under A's goal or a todo under A's plan", async () => {
    const plan = await B.plans.create({ title: "p", weekStart: WEEK, goalId: a.goalId });
    expect(plan.status).toBe(400);
    expect(plan.body.error).toBe("1년 목표를 찾을 수 없습니다");
    const todo = await B.todos.create({ title: "t", weeklyPlanId: a.planId });
    expect(todo.status).toBe(400);
    expect(todo.body.error).toBe("주간계획을 찾을 수 없습니다");
    expect(await WeeklyPlan.countDocuments({ goalId: a.goalId })).toBe(1);
    expect(await Todo.countDocuments({ weeklyPlanId: a.planId })).toBe(2);
  });

  it("B cannot re-link his own plan to A's goal or his own todo to A's plan", async () => {
    const b = await seed({ todos: 1 }, B);
    const plan = await B.plans.update(b.planId, { goalId: a.goalId });
    expect(plan.status).toBe(400);
    const todo = await B.todos.update(b.todoIds[0], { weeklyPlanId: a.planId });
    expect(todo.status).toBe(400);
    expect(String((await WeeklyPlan.findById(b.planId).lean())!.goalId)).toBe(b.goalId);
    expect(String((await Todo.findById(b.todoIds[0]).lean())!.weeklyPlanId)).toBe(b.planId);
  });

  it("B cannot use A's cards as move neighbours", async () => {
    const b = await seed({ todos: 1 }, B);
    const before = await aliceView();
    const res = await B.todos.move(b.todoIds[0], { status: "done", beforeId: a.todoIds[0], seq: 1 });
    expect(res.status).toBe(400);
    expect((await Todo.findById(b.todoIds[0]).lean())!.status).toBe("todo");
    expect(await aliceView()).toEqual(before);
  });
});
