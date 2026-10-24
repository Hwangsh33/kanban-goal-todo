import { describe, expect, it } from "vitest";
import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import {
  activeTodoCountsByPlan,
  countActiveTodos,
  findActiveGoals,
  findActivePlans,
  findActiveTodos,
  getActivePlan,
  getActiveTodo,
} from "@/lib/repo/visibility";
import { setupAuth } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();
const auth = setupAuth();

async function tree() {
  const userId = auth.userId;
  const goal = await Goal.create({ title: "g", year: 2030, userId });
  const plan = await WeeklyPlan.create({ title: "p", weekStart: "2030-03-04", goalId: goal._id, userId });
  const todos = await Todo.create([
    { title: "a", status: "done", date: "2030-03-04", order: 1, weeklyPlanId: plan._id, userId },
    { title: "b", status: "todo", date: "2030-03-04", order: 2, weeklyPlanId: plan._id, userId },
  ]);
  return { goal, plan, todos };
}

describe("visibility rules", () => {
  it("everything is visible when nothing is deleted", async () => {
    const { plan, todos } = await tree();
    expect(await findActiveGoals(auth.userId)).toHaveLength(1);
    expect(await findActivePlans(auth.userId)).toHaveLength(1);
    expect(await findActiveTodos(auth.userId)).toHaveLength(2);
    expect((await activeTodoCountsByPlan(auth.userId)).get(String(plan._id))).toEqual({ done: 1, total: 2 });
    expect(await getActiveTodo(auth.userId, String(todos[0]._id))).not.toBeNull();
  });

  it("a deleted goal hides its plans and todos, including from the aggregation", async () => {
    const { goal, plan, todos } = await tree();
    await Goal.updateOne({ _id: goal._id }, { deletedAt: new Date() });
    expect(await findActiveGoals(auth.userId)).toEqual([]);
    expect(await findActivePlans(auth.userId)).toEqual([]);
    expect(await findActiveTodos(auth.userId)).toEqual([]);
    expect(await countActiveTodos(auth.userId)).toBe(0);
    expect((await activeTodoCountsByPlan(auth.userId)).size).toBe(0);
    expect(await getActivePlan(auth.userId, String(plan._id))).toBeNull();
    expect(await getActiveTodo(auth.userId, String(todos[0]._id))).toBeNull();
  });

  it("a deleted plan hides its todos but not its goal", async () => {
    const { plan } = await tree();
    await WeeklyPlan.updateOne({ _id: plan._id }, { deletedAt: new Date() });
    expect(await findActiveGoals(auth.userId)).toHaveLength(1);
    expect(await findActivePlans(auth.userId)).toEqual([]);
    expect(await findActiveTodos(auth.userId)).toEqual([]);
    expect((await activeTodoCountsByPlan(auth.userId)).size).toBe(0);
  });

  it("a deleted todo is excluded from lists and counts", async () => {
    const { plan, todos } = await tree();
    await Todo.updateOne({ _id: todos[0]._id }, { deletedAt: new Date() });
    expect((await findActiveTodos(auth.userId)).map((t) => t.title)).toEqual(["b"]);
    expect((await activeTodoCountsByPlan(auth.userId)).get(String(plan._id))).toEqual({ done: 0, total: 1 });
  });

  it("caller filters cannot widen the visibility filter", async () => {
    const { plan } = await tree();
    await WeeklyPlan.updateOne({ _id: plan._id }, { deletedAt: new Date() });
    expect(await findActiveTodos(auth.userId, { weeklyPlanId: plan._id })).toEqual([]);
    expect(await findActivePlans(auth.userId, { deletedAt: { $ne: null } })).toEqual([]);
  });
});
