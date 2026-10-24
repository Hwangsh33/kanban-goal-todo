import type { Types } from "mongoose";
import { progressSummary } from "@/lib/domain/progress";
import { weekStartYear } from "@/lib/domain/year";
import { conflict, notFound } from "@/lib/errors";
import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import type { GoalCreateInput, GoalUpdateInput } from "@/lib/validation";
import { goalDto, type GoalDto, type WithProgress } from "./dto";
import { activeTodoCountsByPlan, findActiveGoals, getActiveGoal, toObjectId, type OwnerId } from "./visibility";

export const GOAL_NOT_FOUND = "1년 목표를 찾을 수 없습니다";

export type GoalDescendants = { weeklyPlans: number; todos: number };

/** Children that are hidden together with the goal (those without their own tombstone). */
export async function goalDescendants(owner: OwnerId, goalId: string): Promise<GoalDescendants> {
  const _id = toObjectId(goalId);
  const planIds = (await WeeklyPlan.distinct("_id", { userId: owner, goalId: _id, deletedAt: null })) as Types.ObjectId[];
  const todos = await Todo.countDocuments({ userId: owner, weeklyPlanId: { $in: planIds }, deletedAt: null });
  return { weeklyPlans: planIds.length, todos };
}

/** Year progress = done / total over every active todo of every active plan of the goal. */
async function goalProgressMap(owner: OwnerId): Promise<Map<string, { done: number; total: number }>> {
  const byPlan = await activeTodoCountsByPlan(owner);
  const plans = await WeeklyPlan.find({ userId: owner, _id: { $in: [...byPlan.keys()] } }, { goalId: 1 }).lean();
  const result = new Map<string, { done: number; total: number }>();
  for (const plan of plans) {
    const counts = byPlan.get(String(plan._id))!;
    const acc = result.get(String(plan.goalId)) ?? { done: 0, total: 0 };
    result.set(String(plan.goalId), { done: acc.done + counts.done, total: acc.total + counts.total });
  }
  return result;
}

export async function listGoals(owner: OwnerId): Promise<WithProgress<GoalDto>[]> {
  const [goals, progress] = await Promise.all([findActiveGoals(owner), goalProgressMap(owner)]);
  return goals.map((g) => {
    const c = progress.get(String(g._id)) ?? { done: 0, total: 0 };
    return { ...goalDto(g), progress: progressSummary(c.done, c.total) };
  });
}

export async function getGoalProgress(owner: OwnerId, id: string) {
  if (!(await getActiveGoal(owner, id))) throw notFound(GOAL_NOT_FOUND);
  const c = (await goalProgressMap(owner)).get(id) ?? { done: 0, total: 0 };
  return progressSummary(c.done, c.total);
}

export async function getGoal(owner: OwnerId, id: string) {
  const goal = await getActiveGoal(owner, id);
  if (!goal) throw notFound(GOAL_NOT_FOUND);
  return {
    ...goalDto(goal),
    progress: await getGoalProgress(owner, id),
    descendants: await goalDescendants(owner, id),
  };
}

export async function createGoal(owner: OwnerId, input: GoalCreateInput): Promise<GoalDto> {
  const goal = await Goal.create({ ...input, userId: owner });
  return goalDto(goal.toObject());
}

export async function updateGoal(owner: OwnerId, id: string, input: GoalUpdateInput): Promise<GoalDto> {
  const goal = await getActiveGoal(owner, id);
  if (!goal) throw notFound(GOAL_NOT_FOUND);

  if (input.year !== undefined && input.year !== goal.year) {
    // Includes trashed plans so a later restore can never produce a year mismatch.
    const plans = await WeeklyPlan.find({ userId: owner, goalId: goal._id }, { weekStart: 1 }).lean();
    const mismatched = plans.filter((p) => weekStartYear(p.weekStart) !== input.year);
    if (mismatched.length > 0) {
      throw conflict(
        `연도가 다른 주간계획 ${mismatched.length}개가 연결되어 있어 연도를 변경할 수 없습니다(휴지통 포함)`,
      );
    }
  }

  const updated = await Goal.findOneAndUpdate({ _id: goal._id, userId: owner, deletedAt: null }, { $set: input }, { returnDocument: "after" }).lean();
  if (!updated) throw notFound(GOAL_NOT_FOUND);
  return goalDto(updated);
}

/** Tombstones only the goal document; its plans and todos become invisible through it. */
export async function deleteGoal(owner: OwnerId, id: string, now: Date = new Date()) {
  const goal = await getActiveGoal(owner, id);
  if (!goal) throw notFound(GOAL_NOT_FOUND);
  const descendants = await goalDescendants(owner, id);
  await Goal.updateOne({ _id: goal._id, userId: owner, deletedAt: null }, { $set: { deletedAt: now } });
  return { type: "goal" as const, id, deletedAt: now.toISOString(), descendants };
}
