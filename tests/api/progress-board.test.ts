import { describe, expect, it } from "vitest";
import { api, seed } from "../helpers/api";
import { setupAuth } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();
setupAuth();

describe("weekly plan progress API", () => {
  it("is 0% with no todos", async () => {
    const { planId } = await seed();
    expect((await api.plans.progress(planId)).body).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("is 25% with 1 of 4 done and updates immediately on create, delete and status changes", async () => {
    const { planId, todoIds } = await seed({ todos: 4 });
    await api.todos.move(todoIds[0], { status: "done", seq: 1 });
    expect((await api.plans.progress(planId)).body).toEqual({ done: 1, total: 4, percent: 25 });

    await api.todos.create({ title: "추가", weeklyPlanId: planId });
    expect((await api.plans.progress(planId)).body).toEqual({ done: 1, total: 5, percent: 20 });

    await api.todos.remove(todoIds[1]);
    expect((await api.plans.progress(planId)).body).toEqual({ done: 1, total: 4, percent: 25 });

    await api.todos.move(todoIds[0], { status: "doing", seq: 2 });
    expect((await api.plans.progress(planId)).body).toEqual({ done: 0, total: 4, percent: 0 });

    for (const [i, id] of [todoIds[0], todoIds[2], todoIds[3]].entries()) {
      await api.todos.move(id, { status: "done", seq: 10 + i });
    }
    const list = await api.plans.list();
    expect(list.body[0].progress.percent).toBe(75);
  });
});

describe("goal (year) progress", () => {
  it("sums every active todo of every active plan, excluding deleted plans and todos", async () => {
    const { goalId, planId, todoIds } = await seed({ todos: 2 });
    const plan2 = await api.plans.create({ title: "둘째 주", weekStart: "2030-03-11", goalId });
    const t3 = await api.todos.create({ title: "c", weeklyPlanId: plan2.body.id });
    const t4 = await api.todos.create({ title: "d", weeklyPlanId: plan2.body.id });
    await api.todos.move(todoIds[0], { status: "done", seq: 1 });
    await api.todos.move(t3.body.id, { status: "done", seq: 1 });
    expect((await api.goals.progress(goalId)).body).toEqual({ done: 2, total: 4, percent: 50 });

    await api.todos.remove(t4.body.id);
    expect((await api.goals.progress(goalId)).body).toEqual({ done: 2, total: 3, percent: 67 });

    await api.plans.remove(planId);
    expect((await api.goals.progress(goalId)).body).toEqual({ done: 1, total: 1, percent: 100 });
    expect((await api.goals.list()).body[0].progress).toEqual({ done: 1, total: 1, percent: 100 });
  });

  it("is 0% for a goal without todos", async () => {
    const goal = await api.goals.create({ title: "빈 목표", year: 2030 });
    expect((await api.goals.progress(goal.body.id)).body).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("GET /api/board", () => {
  it("returns the active plans and todos of the week, with plan/day filters and last week's open count", async () => {
    const a = await seed({ weekStart: "2030-03-11" });
    const b = await api.plans.create({ title: "B", weekStart: "2030-03-11", goalId: a.goalId });
    const prev = await api.plans.create({ title: "지난 주", weekStart: "2030-03-04", goalId: a.goalId });
    const deletedPlan = await api.plans.create({ title: "삭제됨", weekStart: "2030-03-11", goalId: a.goalId });

    const mon = await api.todos.create({ title: "월", weeklyPlanId: a.planId, date: "2030-03-11" });
    const wed = await api.todos.create({ title: "수", weeklyPlanId: b.body.id, date: "2030-03-13" });
    await api.todos.create({ title: "숨김", weeklyPlanId: deletedPlan.body.id });
    await api.plans.remove(deletedPlan.body.id);

    const p1 = await api.todos.create({ title: "지난 주 1", weeklyPlanId: prev.body.id });
    await api.todos.create({ title: "지난 주 2", weeklyPlanId: prev.body.id });
    const p3 = await api.todos.create({ title: "지난 주 3", weeklyPlanId: prev.body.id });
    await api.todos.move(p1.body.id, { status: "done", seq: 1 });
    await api.todos.remove(p3.body.id);

    // Any day of the week resolves to that week.
    const board = await api.board("?week=2030-03-14");
    expect(board.status).toBe(200);
    expect(board.body).toMatchObject({ weekStart: "2030-03-11", weekEnd: "2030-03-17", previousWeekIncomplete: 1 });
    expect(board.body.plans.map((p: { id: string }) => p.id).sort()).toEqual([a.planId, b.body.id].sort());
    expect(board.body.todos.map((t: { id: string }) => t.id)).toEqual([mon.body.id, wed.body.id]);
    expect(board.body.plans[0].progress).toEqual({ done: 0, total: 1, percent: 0 });

    const byPlan = await api.board(`?week=2030-03-11&weeklyPlanId=${b.body.id}`);
    expect(byPlan.body.todos.map((t: { id: string }) => t.id)).toEqual([wed.body.id]);

    const byDay = await api.board("?week=2030-03-11&day=mon");
    expect(byDay.body.todos.map((t: { id: string }) => t.id)).toEqual([mon.body.id]);
  });

  it("validates query parameters", async () => {
    expect((await api.board("?week=2030-13-01")).status).toBe(400);
    expect((await api.board("?week=2030-03-11&day=funday")).status).toBe(400);
  });

  it("defaults to the current week", async () => {
    const res = await api.board();
    expect(res.status).toBe(200);
    expect(res.body.todos).toEqual([]);
  });
});
