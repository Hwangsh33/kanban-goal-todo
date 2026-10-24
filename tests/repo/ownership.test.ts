import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { Goal, Todo, WeeklyPlan } from "@/lib/models";
import { assignUnownedData, ensureOwnerIndexes, hasUnownedData, migrateOwnerByGithubId } from "@/lib/repo/ownership";
import { apiAs } from "../helpers/api";
import { createTestUser } from "../helpers/auth";
import { setupTestDb } from "../helpers/mongo";

setupTestDb();

const root = path.resolve(import.meta.dirname, "../..");

/**
 * Pre-login data, inserted without userId (bypassing the schema): one goal with a plan holding a
 * done todo, an open todo and a trashed todo, plus a trashed plan with its own todo.
 */
async function insertLegacyData() {
  const goal = await Goal.collection.insertOne({ title: "옛 목표", year: 2030, deletedAt: null });
  const plan = await WeeklyPlan.collection.insertOne({ title: "옛 계획", weekStart: "2030-03-04", goalId: goal.insertedId, deletedAt: null });
  const trashedPlan = await WeeklyPlan.collection.insertOne({
    title: "지운 계획",
    weekStart: "2030-03-11",
    goalId: goal.insertedId,
    deletedAt: new Date("2030-03-12T00:00:00Z"),
  });
  const todo = (title: string, status: string, weeklyPlanId: unknown, order: number, deletedAt: Date | null = null) => ({
    title,
    status,
    date: "2030-03-04",
    dueDate: null,
    order,
    lastSeq: 0,
    weeklyPlanId,
    deletedAt,
  });
  await Todo.collection.insertMany([
    todo("완료", "done", plan.insertedId, 1),
    todo("진행", "doing", plan.insertedId, 2),
    todo("휴지통", "todo", plan.insertedId, 3, new Date("2030-03-05T00:00:00Z")),
    todo("지운 계획의 할 일", "todo", trashedPlan.insertedId, 1),
  ]);
  return { goalId: String(goal.insertedId), planId: String(plan.insertedId) };
}

/** Everything except userId, keyed by _id, to compare documents before and after the migration. */
async function snapshot() {
  const strip = (docs: Record<string, unknown>[]) =>
    Object.fromEntries(
      docs.map((doc) => {
        const rest = { ...doc };
        delete rest.userId;
        return [String(doc._id), JSON.stringify(rest)];
      }),
    );
  return {
    goals: strip(await Goal.collection.find().toArray()),
    plans: strip(await WeeklyPlan.collection.find().toArray()),
    todos: strip(await Todo.collection.find().toArray()),
  };
}

const owners = async () =>
  [
    ...(await Goal.collection.find().toArray()),
    ...(await WeeklyPlan.collection.find().toArray()),
    ...(await Todo.collection.find().toArray()),
  ].map((d) => (d.userId ? String(d.userId) : null));

describe("assignUnownedData (migration)", () => {
  it("assigns all unowned documents (trashed included), keeps hierarchy/deletedAt/status, and is idempotent", async () => {
    const legacy = await insertLegacyData();
    const other = await createTestUser("other");
    const otherData = await (async () => {
      const api = apiAs(other.cookie);
      const goal = await api.goals.create({ title: "남의 목표", year: 2030 });
      return goal.body.id as string;
    })();
    const me = await createTestUser("me");
    const before = await snapshot();
    expect(await hasUnownedData()).toBe(true);

    const first = await assignUnownedData(me.userId);
    expect(first).toEqual({ goals: 1, weeklyPlans: 2, todos: 4 });
    expect(await hasUnownedData()).toBe(false);
    expect(await snapshot()).toEqual(before); // goalId/weeklyPlanId/deletedAt/status/order/timestamps unchanged
    expect(String((await Goal.findById(otherData).lean())!.userId)).toBe(String(other.userId)); // owned data untouched
    expect((await owners()).filter((o) => o === String(me.userId))).toHaveLength(7);

    const second = await assignUnownedData(me.userId);
    expect(second).toEqual({ goals: 0, weeklyPlans: 0, todos: 0 });
    expect(await snapshot()).toEqual(before);

    // Progress and trash after the migration: done 1 / active 2 (trashed todo and trashed plan excluded).
    const api = apiAs(me.cookie);
    expect((await api.plans.progress(legacy.planId)).body).toEqual({ done: 1, total: 2, percent: 50 });
    expect((await api.goals.progress(legacy.goalId)).body).toEqual({ done: 1, total: 2, percent: 50 });
    expect((await api.trash.list()).body.map((i: { title: string }) => i.title).sort()).toEqual(["지운 계획", "휴지통"]);
    // Restoring the trashed plan brings its todo back under the same hierarchy.
    const trashedPlanId = (await api.trash.list()).body.find((i: { title: string }) => i.title === "지운 계획").id;
    expect((await api.trash.restore({ type: "weeklyPlan", id: trashedPlanId })).status).toBe(200);
    expect((await api.goals.progress(legacy.goalId)).body).toEqual({ done: 1, total: 3, percent: 33 });
  });

  it("creates the userId indexes", async () => {
    await ensureOwnerIndexes();
    for (const model of [Goal, WeeklyPlan, Todo] as mongoose.Model<unknown>[]) {
      const indexes = await model.collection.indexes();
      expect({ model: model.modelName, has: indexes.some((i) => i.key.userId === 1) }).toEqual({ model: model.modelName, has: true });
    }
  });
});

describe("migrateOwnerByGithubId (npm run migrate:owner)", () => {
  it("assigns to the user with that numeric GitHub id", async () => {
    await insertLegacyData();
    const me = await createTestUser("Legacy-Owner");
    const result = await migrateOwnerByGithubId(me.githubId);
    expect(result).toEqual({ username: "Legacy-Owner", goals: 1, weeklyPlans: 2, todos: 4 });
    expect(new Set(await owners())).toEqual(new Set([String(me.userId)]));
  });

  it("matches only the GitHub id, never the (mutable, non-unique) username", async () => {
    await insertLegacyData();
    const impostor = await createTestUser("same-name");
    const me = await createTestUser("same-name");
    expect((await migrateOwnerByGithubId(me.githubId)).goals).toBe(1);
    expect(new Set(await owners())).toEqual(new Set([String(me.userId)]));
    expect(await Goal.countDocuments({ userId: impostor.userId })).toBe(0);
  });

  it("refuses when that user never logged in, changing nothing", async () => {
    await insertLegacyData();
    await createTestUser("someone");
    await expect(migrateOwnerByGithubId(987_654_321)).rejects.toThrow("먼저 그 계정으로 한 번 로그인하세요");
    expect(new Set(await owners())).toEqual(new Set([null]));
  });

  it("leaves data that already has an owner alone", async () => {
    await insertLegacyData();
    const other = await createTestUser("other");
    const othersGoal = (await apiAs(other.cookie).goals.create({ title: "남의 목표", year: 2030 })).body.id as string;
    const me = await createTestUser("me");
    await migrateOwnerByGithubId(me.githubId);
    expect(String((await Goal.findById(othersGoal).lean())!.userId)).toBe(String(other.userId));
    expect((await owners()).filter((o) => o === String(me.userId))).toHaveLength(7);
  });

  const script = () => {
    const cmdline = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts["migrate:owner"] as string;
    const [cmd, ...args] = cmdline.split(" ");
    expect(cmd).toBe("node");
    // MONGODB_URI is this file's test database (set by setupTestDb); process env wins over .env.local.
    return (extra: string[], env: Record<string, string> = {}) =>
      spawnSync(process.execPath, [...args, ...extra], {
        cwd: root,
        env: { ...process.env, LEGACY_OWNER_GITHUB_ID: "", ...env },
        encoding: "utf8",
        timeout: 60_000,
      });
  };

  it("the npm script refuses a non-numeric id (e.g. a username) without changing anything", async () => {
    await insertLegacyData();
    await createTestUser("script-owner");
    const run = script();
    for (const bad of ["script-owner", "0", "-5", "12.5"]) {
      const r = run([bad]);
      expect({ bad, status: r.status }).toEqual({ bad, status: 1 });
      expect(r.stderr).toContain("양의 정수");
    }
    expect(new Set(await owners())).toEqual(new Set([null]));
  });

  it("the npm script falls back to LEGACY_OWNER_GITHUB_ID", async () => {
    await insertLegacyData();
    const me = await createTestUser("env-owner");
    const r = script()([], { LEGACY_OWNER_GITHUB_ID: String(me.githubId) });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(new Set(await owners())).toEqual(new Set([String(me.userId)]));
  });

  it("the npm script runs the migration end to end (twice, idempotent)", async () => {
    await insertLegacyData();
    const me = await createTestUser("script-owner");
    const run = () => script()([String(me.githubId)]);

    const first = run();
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("목표 1, 주간계획 2, 할 일 4");
    expect(new Set(await owners())).toEqual(new Set([String(me.userId)]));

    const second = run();
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("목표 0, 주간계획 0, 할 일 0");
  });
});
