/**
 * npm run migrate:owner [-- <github-id>]
 *
 * Assigns every Goal/WeeklyPlan/Todo without a userId (data created before GitHub login existed,
 * trashed items included) to one user, identified by the GitHub numeric id (immutable, unlike the
 * username). The id defaults to LEGACY_OWNER_GITHUB_ID. Idempotent: documents that already have an
 * owner are never changed, so it is safe to run again.
 * Reads MONGODB_URI from the environment (or .env.local).
 */
import mongoose from "mongoose";
import { parseGithubId } from "@/lib/auth/legacy";
import { connectDb } from "@/lib/db";
import { migrateOwnerByGithubId } from "@/lib/repo/ownership";

async function main(): Promise<number> {
  const raw = (process.argv[2] ?? process.env.LEGACY_OWNER_GITHUB_ID ?? "").trim();
  const githubId = parseGithubId(raw);
  if (githubId === null) {
    console.error(
      "사용법: npm run migrate:owner -- <github-id>  (또는 LEGACY_OWNER_GITHUB_ID 설정). " +
        "GitHub id 는 양의 정수입니다: https://api.github.com/users/<login> 의 \"id\"",
    );
    return 1;
  }
  await connectDb();
  try {
    const r = await migrateOwnerByGithubId(githubId);
    console.log(
      `GitHub id ${githubId} (${r.username}) 에게 귀속: 목표 ${r.goals}, 주간계획 ${r.weeklyPlans}, 할 일 ${r.todos} (이미 소유자가 있는 문서는 변경 없음)`,
    );
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
