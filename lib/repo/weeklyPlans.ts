import type { QueryFilter } from "mongoose";
import { progressSummary } from "@/lib/domain/progress";
import { DAY_MS, weekEnd } from "@/lib/domain/week";
import { isWeekStartInGoalYear } from "@/lib/domain/year";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { Todo, WeeklyPlan, type WeeklyPlanDoc } from "@/lib/models";
import type { WeeklyPlanCreateInput, WeeklyPlanUpdateInput } from "@/lib/validation";
import { weeklyPlanDto, type WeeklyPlanDto, type WithProgress } from "./dto";
import { GOAL_NOT_FOUND } from "./goals";
import { activeTodoCountsByPlan, findActivePlans, getActiveGoal, getActivePlan, toObjectId, type OwnerId } from "./visibility";

export const PLAN_NOT_FOUND = "주간계획을 찾을 수 없습니다";
const YEAR_MISMATCH = "주간계획의 주 시작일(월요일) 연도가 1년 목표의 연도와 같아야 합니다";
const PLAN_CHANGED = "다른 요청이 주간계획을 먼저 변경했습니다. 새로고침 후 다시 시도해 주세요";

export type PlanDescendants = { todos: number };

export async function planDescendants(owner: OwnerId, planId: string): Promise<PlanDescendants> {
  return { todos: await Todo.countDocuments({ userId: owner, weeklyPlanId: toObjectId(planId), deletedAt: null }) };
}

export async function listWeeklyPlans(
  owner: OwnerId,
  query: { goalId?: string; weekStart?: string } = {},
): Promise<WithProgress<WeeklyPlanDto>[]> {
  const filter: QueryFilter<WeeklyPlanDoc> = {};
  if (query.goalId !== undefined) {
    const goalId = toObjectId(query.goalId);
    if (!goalId) return [];
    filter.goalId = goalId;
  }
  if (query.weekStart !== undefined) filter.weekStart = query.weekStart;

  const [plans, counts] = await Promise.all([findActivePlans(owner, filter), activeTodoCountsByPlan(owner, filter)]);
  return plans.map((p) => {
    const c = counts.get(String(p._id)) ?? { done: 0, total: 0 };
    return { ...weeklyPlanDto(p), progress: progressSummary(c.done, c.total) };
  });
}

export async function getWeeklyPlanProgress(owner: OwnerId, id: string) {
  const plan = await getActivePlan(owner, id);
  if (!plan) throw notFound(PLAN_NOT_FOUND);
  const c = (await activeTodoCountsByPlan(owner, { _id: plan._id })).get(id) ?? { done: 0, total: 0 };
  return progressSummary(c.done, c.total);
}

export async function getWeeklyPlan(owner: OwnerId, id: string) {
  const plan = await getActivePlan(owner, id);
  if (!plan) throw notFound(PLAN_NOT_FOUND);
  return {
    ...weeklyPlanDto(plan),
    progress: await getWeeklyPlanProgress(owner, id),
    descendants: await planDescendants(owner, id),
  };
}

async function requireGoalOfYear(owner: OwnerId, goalId: string, weekStart: string) {
  const goal = await getActiveGoal(owner, goalId);
  if (!goal) throw badRequest(GOAL_NOT_FOUND);
  if (!isWeekStartInGoalYear(weekStart, goal.year)) throw badRequest(YEAR_MISMATCH);
  return goal;
}

export async function createWeeklyPlan(owner: OwnerId, input: WeeklyPlanCreateInput): Promise<WeeklyPlanDto> {
  const goal = await requireGoalOfYear(owner, input.goalId, input.weekStart);
  const plan = await WeeklyPlan.create({ title: input.title, weekStart: input.weekStart, goalId: goal._id, userId: owner });
  return weeklyPlanDto(plan.toObject());
}

/**
 * Updates title / weekStart / goal link. The year rule is checked against the resulting pair.
 *
 * The plan is written first with a compare-and-set on the weekStart this request read (409 when a
 * concurrent request changed it). Then every todo of the plan (including trashed ones, so a
 * restore stays in range) whose date lies outside the plan's week is moved into it, keeping its
 * weekday. That step only touches out-of-range dates, so it is idempotent: it runs on every PATCH
 * and a shift that failed after the plan write is healed by retrying the same PATCH.
 */
export async function updateWeeklyPlan(owner: OwnerId, id: string, input: WeeklyPlanUpdateInput): Promise<WeeklyPlanDto> {
  const plan = await getActivePlan(owner, id);
  if (!plan) throw notFound(PLAN_NOT_FOUND);

  const weekStart = input.weekStart ?? plan.weekStart;
  const goalId = input.goalId ?? String(plan.goalId);
  const goal = await requireGoalOfYear(owner, goalId, weekStart);

  const set: Partial<WeeklyPlanDoc> = { weekStart, goalId: goal._id };
  if (input.title !== undefined) set.title = input.title;
  const updated = await WeeklyPlan.findOneAndUpdate(
    { _id: plan._id, userId: owner, deletedAt: null, weekStart: plan.weekStart },
    { $set: set },
    { returnDocument: "after" },
  ).lean<WeeklyPlanDoc>();
  if (!updated) {
    if (await getActivePlan(owner, id)) throw conflict(PLAN_CHANGED);
    throw notFound(PLAN_NOT_FOUND);
  }

  await moveTodosIntoWeek(owner, updated._id, weekStart);
  return weeklyPlanDto(updated);
}

/** Sets each out-of-range todo date of the plan to the same weekday inside the given week. */
async function moveTodosIntoWeek(owner: OwnerId, planId: WeeklyPlanDoc["_id"], weekStart: string) {
  const dayOfWeek = { $isoDayOfWeek: { $dateFromString: { dateString: "$date", format: "%Y-%m-%d" } } }; // Mon=1..Sun=7
  await Todo.updateMany(
    { userId: owner, weeklyPlanId: planId, $or: [{ date: { $lt: weekStart } }, { date: { $gt: weekEnd(weekStart) } }] },
    [
      {
        $set: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: {
                $add: [
                  { $dateFromString: { dateString: weekStart, format: "%Y-%m-%d" } },
                  { $multiply: [{ $subtract: [dayOfWeek, 1] }, DAY_MS] },
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true },
  );
}

/** Tombstones only the plan document; its todos become invisible through it. */
export async function deleteWeeklyPlan(owner: OwnerId, id: string, now: Date = new Date()) {
  const plan = await getActivePlan(owner, id);
  if (!plan) throw notFound(PLAN_NOT_FOUND);
  const descendants = await planDescendants(owner, id);
  await WeeklyPlan.updateOne({ _id: plan._id, userId: owner, deletedAt: null }, { $set: { deletedAt: now } });
  return { type: "weeklyPlan" as const, id, deletedAt: now.toISOString(), descendants };
}
