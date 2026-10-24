import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import { findUserByGithubId } from "./users";
import type { OwnerId } from "./visibility";

export type OwnershipResult = { goals: number; weeklyPlans: number; todos: number };

/** `{ userId: null }` matches documents whose userId is missing or null (data created before login). */
const UNOWNED = { userId: null };

/** Makes sure the userId indexes exist (also created by Mongoose autoIndex; this is explicit for the migration). */
export async function ensureOwnerIndexes(): Promise<void> {
  await Promise.all([Goal.createIndexes(), WeeklyPlan.createIndexes(), Todo.createIndexes()]);
}

/**
 * Assigns every unowned Goal/WeeklyPlan/Todo (trashed ones included) to `owner`. Documents that
 * already have a userId are never touched, so running it again changes nothing (idempotent). Only
 * `userId` is written: hierarchy links, deletedAt, status/order and timestamps stay as they are.
 */
export async function assignUnownedData(owner: OwnerId): Promise<OwnershipResult> {
  const set = { $set: { userId: owner } };
  const options = { timestamps: false };
  const [goals, weeklyPlans, todos] = await Promise.all([
    Goal.updateMany(UNOWNED, set, options),
    WeeklyPlan.updateMany(UNOWNED, set, options),
    Todo.updateMany(UNOWNED, set, options),
  ]);
  return { goals: goals.modifiedCount, weeklyPlans: weeklyPlans.modifiedCount, todos: todos.modifiedCount };
}

/**
 * `npm run migrate:owner`: assigns unowned data to the user with this GitHub numeric id (unique and
 * immutable, unlike the username). The user must have logged in once (that creates the User document).
 */
export async function migrateOwnerByGithubId(githubId: number): Promise<OwnershipResult & { username: string }> {
  const user = await findUserByGithubId(githubId);
  if (!user) {
    throw new Error(`GitHub id ${githubId} 사용자를 찾을 수 없습니다. 먼저 그 계정으로 한 번 로그인하세요`);
  }
  await ensureOwnerIndexes();
  return { username: user.username, ...(await assignUnownedData(user.id)) };
}

/** True while any document still has no owner. */
export async function hasUnownedData(): Promise<boolean> {
  const found = await Promise.all([Goal.exists(UNOWNED), WeeklyPlan.exists(UNOWNED), Todo.exists(UNOWNED)]);
  return found.some((f) => f !== null);
}
