import type { Types } from "mongoose";
import { DAY_MS } from "@/lib/domain/week";
import { conflict, notFound } from "@/lib/errors";
import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import type { TrashRestoreInput } from "@/lib/validation";
import { goalDescendants, type GoalDescendants } from "./goals";
import { planDescendants, type PlanDescendants } from "./weeklyPlans";
import { toObjectId, type OwnerId } from "./visibility";

const TRASH_RETENTION_DAYS = 30;
const PARENT_DELETED = "상위 항목을 먼저 복원하세요";
const NOT_IN_TRASH = "휴지통에서 항목을 찾을 수 없습니다";

type TrashType = TrashRestoreInput["type"];
type ParentRef = { type: "goal" | "weeklyPlan"; id: string };

export type TrashItem = {
  type: TrashType;
  id: string;
  title: string;
  deletedAt: string;
  descendants: GoalDescendants | PlanDescendants | Record<string, never>;
  /** Set when an ancestor is also deleted: the item cannot be restored on its own. */
  deletedParent: ParentRef | null;
};

async function deletedParentOfPlan(owner: OwnerId, goalId: unknown): Promise<ParentRef | null> {
  const goal = await Goal.findOne({ _id: goalId, userId: owner }, { deletedAt: 1 }).lean();
  return goal && goal.deletedAt === null ? null : { type: "goal", id: String(goalId) };
}

async function deletedParentOfTodo(owner: OwnerId, weeklyPlanId: unknown): Promise<ParentRef | null> {
  const plan = await WeeklyPlan.findOne({ _id: weeklyPlanId, userId: owner }, { deletedAt: 1, goalId: 1 }).lean();
  if (!plan || plan.deletedAt !== null) return { type: "weeklyPlan", id: String(weeklyPlanId) };
  return deletedParentOfPlan(owner, plan.goalId);
}

/**
 * Hard-deletes tombstoned roots older than the retention period together with all their
 * descendants. Children are removed before the root so an interrupted purge is simply retried.
 */
export async function purgeExpired(owner: OwnerId, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);
  const mine = { userId: owner };
  const expired = { ...mine, deletedAt: { $ne: null, $lte: cutoff } };

  const goalIds = (await Goal.distinct("_id", expired)) as Types.ObjectId[];
  const goalPlanIds = (await WeeklyPlan.distinct("_id", { ...mine, goalId: { $in: goalIds } })) as Types.ObjectId[];
  await Todo.deleteMany({ ...mine, weeklyPlanId: { $in: goalPlanIds } });
  await WeeklyPlan.deleteMany({ ...mine, _id: { $in: goalPlanIds } });
  await Goal.deleteMany({ ...mine, _id: { $in: goalIds } });

  const planIds = (await WeeklyPlan.distinct("_id", expired)) as Types.ObjectId[];
  await Todo.deleteMany({ ...mine, weeklyPlanId: { $in: planIds } });
  await WeeklyPlan.deleteMany({ ...mine, _id: { $in: planIds } });

  const todos = await Todo.deleteMany(expired);
  return { goals: goalIds.length, weeklyPlans: goalPlanIds.length + planIds.length, todos: todos.deletedCount };
}

/** Lists tombstoned roots (newest first) after lazily purging expired ones. */
export async function listTrash(owner: OwnerId, now: Date = new Date()): Promise<TrashItem[]> {
  await purgeExpired(owner, now);
  const deleted = { userId: owner, deletedAt: { $ne: null } };
  const [goals, plans, todos] = await Promise.all([
    Goal.find(deleted).lean(),
    WeeklyPlan.find(deleted).lean(),
    Todo.find(deleted).lean(),
  ]);

  const items: TrashItem[] = [
    ...(await Promise.all(
      goals.map(async (g) => ({
        type: "goal" as const,
        id: String(g._id),
        title: g.title,
        deletedAt: g.deletedAt!.toISOString(),
        descendants: await goalDescendants(owner, String(g._id)),
        deletedParent: null,
      })),
    )),
    ...(await Promise.all(
      plans.map(async (p) => ({
        type: "weeklyPlan" as const,
        id: String(p._id),
        title: p.title,
        deletedAt: p.deletedAt!.toISOString(),
        descendants: await planDescendants(owner, String(p._id)),
        deletedParent: await deletedParentOfPlan(owner, p.goalId),
      })),
    )),
    ...(await Promise.all(
      todos.map(async (t) => ({
        type: "todo" as const,
        id: String(t._id),
        title: t.title,
        deletedAt: t.deletedAt!.toISOString(),
        descendants: {},
        deletedParent: await deletedParentOfTodo(owner, t.weeklyPlanId),
      })),
    )),
  ];
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Permanently deletes one item that is in the trash (has its own tombstone) together with all of
 * its descendants, including separately trashed ones. Children are removed before the root.
 */
export async function deleteFromTrash(owner: OwnerId, input: TrashRestoreInput) {
  const _id = toObjectId(input.id);
  if (!_id) throw notFound(NOT_IN_TRASH);
  const filter = { _id, userId: owner, deletedAt: { $ne: null } };

  if (input.type === "goal") {
    if (!(await Goal.exists(filter))) throw notFound(NOT_IN_TRASH);
    const planIds = (await WeeklyPlan.distinct("_id", { userId: owner, goalId: _id })) as Types.ObjectId[];
    await Todo.deleteMany({ userId: owner, weeklyPlanId: { $in: planIds } });
    await WeeklyPlan.deleteMany({ userId: owner, _id: { $in: planIds } });
    await Goal.deleteOne(filter);
  } else if (input.type === "weeklyPlan") {
    if (!(await WeeklyPlan.exists(filter))) throw notFound(NOT_IN_TRASH);
    await Todo.deleteMany({ userId: owner, weeklyPlanId: _id });
    await WeeklyPlan.deleteOne(filter);
  } else {
    const res = await Todo.deleteOne(filter);
    if (res.deletedCount === 0) throw notFound(NOT_IN_TRASH);
  }
  return { type: input.type, id: input.id, deleted: true };
}

/** Restore = remove the root's tombstone. Refused (409) while an ancestor is still deleted. */
export async function restoreFromTrash(owner: OwnerId, input: TrashRestoreInput) {
  const _id = toObjectId(input.id);
  if (!_id) throw notFound(NOT_IN_TRASH);
  const filter = { _id, userId: owner, deletedAt: { $ne: null } };
  const restore = { $set: { deletedAt: null } };

  if (input.type === "goal") {
    const res = await Goal.updateOne(filter, restore);
    if (res.matchedCount === 0) throw notFound(NOT_IN_TRASH);
  } else if (input.type === "weeklyPlan") {
    const plan = await WeeklyPlan.findOne(filter).lean();
    if (!plan) throw notFound(NOT_IN_TRASH);
    const parent = await deletedParentOfPlan(owner, plan.goalId);
    if (parent) throw conflict(PARENT_DELETED, { parent });
    await WeeklyPlan.updateOne(filter, restore);
  } else {
    const todo = await Todo.findOne(filter).lean();
    if (!todo) throw notFound(NOT_IN_TRASH);
    const parent = await deletedParentOfTodo(owner, todo.weeklyPlanId);
    if (parent) throw conflict(PARENT_DELETED, { parent });
    await Todo.updateOne(filter, restore);
  }
  return { type: input.type, id: input.id, restored: true };
}
