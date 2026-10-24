import mongoose, { type QueryFilter } from "mongoose";
import { Goal, Todo, WeeklyPlan, type GoalDoc, type TodoDoc, type WeeklyPlanDoc } from "@/lib/models";

/**
 * Visibility rules (the only place active documents are selected):
 *   Goal active       = deletedAt is null
 *   WeeklyPlan active = itself active AND parent Goal active
 *   Todo active       = itself active AND parent WeeklyPlan active (which implies Goal active)
 * Every selector is scoped to one owner (`userId`): documents of other users are never visible.
 */

type Id = mongoose.Types.ObjectId;
/** The logged-in user's id. Always comes from the session, never from the request body. */
export type OwnerId = mongoose.Types.ObjectId;

export function toObjectId(id: string): Id | null {
  return /^[0-9a-f]{24}$/i.test(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function activeGoalIds(owner: OwnerId): Promise<Id[]> {
  return (await Goal.distinct("_id", { userId: owner, deletedAt: null })) as Id[];
}

export async function findActiveGoals(owner: OwnerId): Promise<GoalDoc[]> {
  return Goal.find({ userId: owner, deletedAt: null }).sort({ year: 1, createdAt: 1 }).lean<GoalDoc[]>();
}

export async function findActivePlans(
  owner: OwnerId,
  filter: QueryFilter<WeeklyPlanDoc> = {},
): Promise<WeeklyPlanDoc[]> {
  const goalIds = await activeGoalIds(owner);
  return WeeklyPlan.find({ $and: [filter, { userId: owner, deletedAt: null, goalId: { $in: goalIds } }] })
    .sort({ weekStart: 1, createdAt: 1 })
    .lean<WeeklyPlanDoc[]>();
}

async function activePlanIds(owner: OwnerId, filter: QueryFilter<WeeklyPlanDoc> = {}): Promise<Id[]> {
  return (await findActivePlans(owner, filter)).map((p) => p._id);
}

function activeTodoQuery(owner: OwnerId, planIds: Id[], filter: QueryFilter<TodoDoc>): QueryFilter<TodoDoc> {
  return { $and: [filter, { userId: owner, deletedAt: null, weeklyPlanId: { $in: planIds } }] };
}

export async function findActiveTodos(
  owner: OwnerId,
  filter: QueryFilter<TodoDoc> = {},
  planFilter: QueryFilter<WeeklyPlanDoc> = {},
): Promise<TodoDoc[]> {
  const planIds = await activePlanIds(owner, planFilter);
  return Todo.find(activeTodoQuery(owner, planIds, filter)).sort({ order: 1, createdAt: 1 }).lean<TodoDoc[]>();
}

export async function countActiveTodos(
  owner: OwnerId,
  filter: QueryFilter<TodoDoc> = {},
  planFilter: QueryFilter<WeeklyPlanDoc> = {},
): Promise<number> {
  const planIds = await activePlanIds(owner, planFilter);
  return Todo.countDocuments(activeTodoQuery(owner, planIds, filter));
}

/** Done/total counts of active todos grouped by weekly plan (only active plans are counted). */
export async function activeTodoCountsByPlan(
  owner: OwnerId,
  planFilter: QueryFilter<WeeklyPlanDoc> = {},
): Promise<Map<string, { done: number; total: number }>> {
  const planIds = await activePlanIds(owner, planFilter);
  const rows = await Todo.aggregate<{ _id: Id; done: number; total: number }>([
    { $match: { userId: owner, deletedAt: null, weeklyPlanId: { $in: planIds } } },
    {
      $group: {
        _id: "$weeklyPlanId",
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { done: r.done, total: r.total }]));
}

export async function getActiveGoal(owner: OwnerId, id: string): Promise<GoalDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  return Goal.findOne({ _id, userId: owner, deletedAt: null }).lean<GoalDoc>();
}

export async function getActivePlan(owner: OwnerId, id: string): Promise<WeeklyPlanDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const plan = await WeeklyPlan.findOne({ _id, userId: owner, deletedAt: null }).lean<WeeklyPlanDoc>();
  if (!plan) return null;
  return (await getActiveGoal(owner, String(plan.goalId))) ? plan : null;
}

export async function getActiveTodo(
  owner: OwnerId,
  id: string,
): Promise<{ todo: TodoDoc; plan: WeeklyPlanDoc } | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const todo = await Todo.findOne({ _id, userId: owner, deletedAt: null }).lean<TodoDoc>();
  if (!todo) return null;
  const plan = await getActivePlan(owner, String(todo.weeklyPlanId));
  return plan ? { todo, plan } : null;
}
