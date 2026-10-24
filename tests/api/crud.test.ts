import { afterEach, describe, expect, it, vi } from "vitest";
import { today, weekStart } from "@/lib/domain/week";
import { weekStartYear } from "@/lib/domain/year";
import { Todo, WeeklyPlan } from "@/lib/models";
import { api, seed } from "../helpers/api";
import { setupAuth } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();
setupAuth();

describe("Goal CRUD", () => {
  it("creates, reads, updates and lists goals", async () => {
    const created = await api.goals.create({ title: "  건강  ", year: 2030 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "건강", year: 2030, deletedAt: null });

    const updated = await api.goals.update(created.body.id, { title: "체력" });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("체력");

    const got = await api.goals.get(created.body.id);
    expect(got.body).toMatchObject({ title: "체력", progress: { done: 0, total: 0, percent: 0 } });

    const list = await api.goals.list();
    expect(list.body.map((g: { id: string }) => g.id)).toEqual([created.body.id]);
  });

  it("rejects a blank title with 400 and a Korean message", async () => {
    const res = await api.goals.create({ title: "   ", year: 2030 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("제목을 입력하세요");
  });

  it("returns 404 for unknown or malformed ids and 400 for invalid JSON", async () => {
    expect((await api.goals.get("000000000000000000000000")).status).toBe(404);
    expect((await api.goals.get("abc")).status).toBe(404);
    expect((await api.goals.create("{not json")).status).toBe(400);
  });
});

describe("WeeklyPlan CRUD", () => {
  it("creates, updates and deletes a plan", async () => {
    const { goalId, planId } = await seed();
    const got = await api.plans.get(planId);
    expect(got.body).toMatchObject({ weekStart: "2030-03-04", goalId, descendants: { todos: 0 } });

    const updated = await api.plans.update(planId, { title: "새 제목" });
    expect(updated.body.title).toBe("새 제목");

    expect((await api.plans.remove(planId)).status).toBe(200);
    expect((await api.plans.get(planId)).status).toBe(404);
  });

  it("requires a goal, a title and a Monday weekStart", async () => {
    const goal = await api.goals.create({ title: "g", year: 2030 });
    const noGoal = await api.plans.create({ title: "p", weekStart: "2030-03-04" });
    expect(noGoal.status).toBe(400);
    expect(noGoal.body.error).toBe("1년 목표를 선택하세요");

    const blank = await api.plans.create({ title: "", weekStart: "2030-03-04", goalId: goal.body.id });
    expect(blank.body.error).toBe("제목을 입력하세요");

    const notMonday = await api.plans.create({ title: "p", weekStart: "2030-03-05", goalId: goal.body.id });
    expect(notMonday.status).toBe(400);
    expect(notMonday.body.error).toContain("월요일");
  });

  it("filters the list by goalId and weekStart", async () => {
    const a = await seed({ weekStart: "2030-03-04" });
    await seed({ weekStart: "2030-03-11" });
    const byGoal = await api.plans.list(`?goalId=${a.goalId}`);
    expect(byGoal.body.map((p: { id: string }) => p.id)).toEqual([a.planId]);
    const byWeek = await api.plans.list("?weekStart=2030-03-11");
    expect(byWeek.body).toHaveLength(1);
  });
});

describe("Todo CRUD and date rules", () => {
  it("rejects a missing weeklyPlanId and a blank title with Korean messages", async () => {
    const noPlan = await api.todos.create({ title: "할 일" });
    expect(noPlan.status).toBe(400);
    expect(noPlan.body.error).toBe("주간계획을 선택하세요");

    const { planId } = await seed();
    const blank = await api.todos.create({ title: "  ", weeklyPlanId: planId });
    expect(blank.status).toBe(400);
    expect(blank.body.error).toBe("제목을 입력하세요");
  });

  it("creates a todo with status=todo and date=weekStart for a plan of another week", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const res = await api.todos.create({ title: "할 일", weeklyPlanId: planId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "todo", date: "2030-03-04", lastSeq: 0 });
  });

  it("defaults date to today (APP_TIMEZONE) for a plan of the current week", async () => {
    const ws = weekStart(today());
    const { planId } = await seed({ year: weekStartYear(ws), weekStart: ws });
    const res = await api.todos.create({ title: "오늘 할 일", weeklyPlanId: planId });
    expect(res.body.date).toBe(today());
  });

  it("accepts an explicit date inside the week and rejects one outside", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const inside = await api.todos.create({ title: "a", weeklyPlanId: planId, date: "2030-03-10" });
    expect(inside.status).toBe(201);
    const outside = await api.todos.create({ title: "b", weeklyPlanId: planId, date: "2030-03-11" });
    expect(outside.status).toBe(400);
    expect(outside.body.error).toContain("주 범위");
  });

  it("updates title and date (within the week) and rejects an out-of-range date", async () => {
    const { todoIds } = await seed({ todos: 1 });
    const res = await api.todos.update(todoIds[0], { title: "수정됨", date: "2030-03-06" });
    expect(res.body).toMatchObject({ title: "수정됨", date: "2030-03-06" });
    expect((await api.todos.update(todoIds[0], { date: "2030-03-03" })).status).toBe(400);
  });

  it("moving a todo to a plan of another week keeps its weekday", async () => {
    const a = await seed({ weekStart: "2030-03-04" });
    const b = await seed({ weekStart: "2030-04-01" });
    const todo = await api.todos.create({ title: "목요일", weeklyPlanId: a.planId, date: "2030-03-07" });
    const moved = await api.todos.update(todo.body.id, { weeklyPlanId: b.planId });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ weeklyPlanId: b.planId, date: "2030-04-04" });
  });

  it("moving a todo to a plan of another week appends it to the end of its column there", async () => {
    const a = await seed({ weekStart: "2030-03-04", todos: 1 });
    const b = await seed({ weekStart: "2030-04-01", todos: 2 });
    const moved = await api.todos.update(a.todoIds[0], { weeklyPlanId: b.planId });
    expect(moved.status).toBe(200);
    const column = (await api.board("?week=2030-04-01")).body.todos as { id: string; order: number }[];
    const sorted = [...column].sort((x, y) => x.order - y.order).map((t) => t.id);
    expect(sorted).toEqual([...b.todoIds, a.todoIds[0]]);
    expect(new Set(column.map((t) => t.order)).size).toBe(3);
  });

  it("deletes a todo", async () => {
    const { todoIds } = await seed({ todos: 1 });
    expect((await api.todos.remove(todoIds[0])).status).toBe(200);
    expect((await api.todos.get(todoIds[0])).status).toBe(404);
  });
});

describe("WeeklyPlan weekStart change shifts todo dates", () => {
  it("shifts every todo (including a trashed one) by the same number of days; restore stays in range", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const mon = await api.todos.create({ title: "월", weeklyPlanId: planId, date: "2030-03-04" });
    const sun = await api.todos.create({ title: "일", weeklyPlanId: planId, date: "2030-03-10" });
    await api.todos.remove(sun.body.id);

    const res = await api.plans.update(planId, { weekStart: "2030-03-18" });
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe("2030-03-18");
    expect((await api.todos.get(mon.body.id)).body.date).toBe("2030-03-18");

    expect((await api.trash.restore({ type: "todo", id: sun.body.id })).status).toBe(200);
    expect((await api.todos.get(sun.body.id)).body.date).toBe("2030-03-24");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("concurrent PATCHes of the same weekStart change shift the todos only once", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const thu = await api.todos.create({ title: "목", weeklyPlanId: planId, date: "2030-03-07" });

    const results = await Promise.all([
      api.plans.update(planId, { weekStart: "2030-03-18" }),
      api.plans.update(planId, { weekStart: "2030-03-18" }),
    ]);
    expect(results.map((r) => r.status)).toContain(200);
    for (const r of results) {
      expect([200, 409]).toContain(r.status);
      if (r.status === 409) expect(r.body.error).toMatch(/[가-힣]/);
    }
    expect((await api.plans.get(planId)).body.weekStart).toBe("2030-03-18");
    expect((await api.todos.get(thu.body.id)).body.date).toBe("2030-03-21");
  });

  it("rejects a PATCH based on a stale weekStart with 409 instead of shifting again", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const thu = await api.todos.create({ title: "목", weeklyPlanId: planId, date: "2030-03-07" });
    // Another request changes weekStart after this request has read the plan, before it writes.
    const real = WeeklyPlan.findOneAndUpdate.bind(WeeklyPlan);
    vi.spyOn(WeeklyPlan, "findOneAndUpdate").mockImplementationOnce(((...args: Parameters<typeof real>) => ({
      lean: () => WeeklyPlan.updateOne({ _id: planId }, { weekStart: "2030-03-11" }).then(() => real(...args).lean()),
    })) as never);

    const res = await api.plans.update(planId, { weekStart: "2030-03-18" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/[가-힣]/);
    // Retrying the PATCH moves the plan and puts the todo into the new week exactly once.
    expect((await api.plans.update(planId, { weekStart: "2030-03-18" })).status).toBe(200);
    expect((await api.todos.get(thu.body.id)).body.date).toBe("2030-03-21");
  });

  it("a shift that failed after the plan update is healed by retrying the same PATCH (trashed todos too)", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const thu = await api.todos.create({ title: "목", weeklyPlanId: planId, date: "2030-03-07" });
    const sun = await api.todos.create({ title: "일", weeklyPlanId: planId, date: "2030-03-10" });
    await api.todos.remove(sun.body.id);

    vi.spyOn(Todo, "updateMany").mockRejectedValueOnce(new Error("crash"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await api.plans.update(planId, { weekStart: "2030-03-18" })).status).toBe(500);
    vi.restoreAllMocks();
    expect((await api.plans.get(planId)).body.weekStart).toBe("2030-03-18");

    const retry = await api.plans.update(planId, { weekStart: "2030-03-18" });
    expect(retry.status).toBe(200);
    expect((await api.todos.get(thu.body.id)).body.date).toBe("2030-03-21");
    expect((await api.todos.update(thu.body.id, { title: "제목 수정" })).status).toBe(200);
    expect((await api.trash.restore({ type: "todo", id: sun.body.id })).status).toBe(200);
    expect((await api.todos.get(sun.body.id)).body.date).toBe("2030-03-24");

    // Idempotent: another identical PATCH moves nothing.
    expect((await api.plans.update(planId, { weekStart: "2030-03-18" })).status).toBe(200);
    expect((await api.todos.get(thu.body.id)).body.date).toBe("2030-03-21");
  });

  it("heals todos left outside the week (plan moved, todos not) on a PATCH with an unchanged weekStart", async () => {
    const { planId } = await seed({ weekStart: "2030-03-04" });
    const thu = await api.todos.create({ title: "목", weeklyPlanId: planId, date: "2030-03-07" });
    await WeeklyPlan.updateOne({ _id: planId }, { weekStart: "2030-03-18" });
    expect((await api.todos.update(thu.body.id, { title: "실패" })).status).toBe(400);

    expect((await api.plans.update(planId, { title: "주간계획" })).status).toBe(200);
    expect((await api.todos.get(thu.body.id)).body.date).toBe("2030-03-21");
    expect((await api.todos.update(thu.body.id, { title: "제목 수정" })).status).toBe(200);
  });
});

describe("Year rule (weekStart year must equal Goal.year)", () => {
  it("rejects creating a plan in another year", async () => {
    const goal = await api.goals.create({ title: "g", year: 2030 });
    const res = await api.plans.create({ title: "p", weekStart: "2031-01-06", goalId: goal.body.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("연도");
  });

  it("assigns a New Year week to the year of its Monday", async () => {
    const goal2030 = await api.goals.create({ title: "g", year: 2030 });
    // 2030-12-30 is a Monday whose week ends in 2031.
    const ok = await api.plans.create({ title: "p", weekStart: "2030-12-30", goalId: goal2030.body.id });
    expect(ok.status).toBe(201);
  });

  it("rejects re-linking a plan to a goal of another year and weekStart changes into another year", async () => {
    const { planId } = await seed({ year: 2030, weekStart: "2030-03-04" });
    const goal2031 = await api.goals.create({ title: "g31", year: 2031 });
    const relink = await api.plans.update(planId, { goalId: goal2031.body.id });
    expect(relink.status).toBe(400);

    const move = await api.plans.update(planId, { weekStart: "2031-01-06" });
    expect(move.status).toBe(400);

    const both = await api.plans.update(planId, { goalId: goal2031.body.id, weekStart: "2031-01-06" });
    expect(both.status).toBe(200);
  });

  it("rejects changing Goal.year while a plan (even a trashed one) has another year", async () => {
    const { goalId, planId } = await seed({ year: 2030, weekStart: "2030-03-04" });
    await api.plans.remove(planId);
    const res = await api.goals.update(goalId, { year: 2031 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("연도");

    const empty = await api.goals.create({ title: "빈 목표", year: 2030 });
    expect((await api.goals.update(empty.body.id, { year: 2031 })).body.year).toBe(2031);
  });
});
