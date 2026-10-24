import { assignUnownedData, hasUnownedData, type OwnershipResult } from "@/lib/repo/ownership";
import type { SessionUser } from "@/lib/repo/users";

/** A GitHub numeric id: a positive safe integer in plain decimal digits. Anything else → null. */
export function parseGithubId(raw: string): number | null {
  const text = raw.trim();
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Runs on every successful login. When the user's GitHub numeric id (immutable and unique, unlike
 * the username) equals LEGACY_OWNER_GITHUB_ID, data created before login existed is assigned to
 * them. An unset or invalid value claims nothing and logs a warning.
 * Idempotent: after the first run there is nothing unowned left to assign.
 */
export async function claimLegacyDataOnLogin(user: SessionUser): Promise<OwnershipResult | null> {
  const raw = process.env.LEGACY_OWNER_GITHUB_ID?.trim();
  const legacyOwnerId = raw ? parseGithubId(raw) : null;
  if (legacyOwnerId === null) {
    if (raw) {
      // The value itself is not logged.
      console.warn("LEGACY_OWNER_GITHUB_ID 환경변수가 양의 정수(GitHub 숫자 id)가 아니어서 무시합니다. 기존 데이터를 귀속하지 않았습니다");
    } else if (await hasUnownedData()) {
      console.warn(
        "LEGACY_OWNER_GITHUB_ID 환경변수가 설정되지 않아 소유자 없는 기존 데이터를 귀속하지 않았습니다. " +
          "설정 후 다시 로그인하거나 npm run migrate:owner 를 실행하세요",
      );
    }
    return null;
  }
  if (legacyOwnerId !== user.githubId) return null;

  const result = await assignUnownedData(user.id);
  const total = result.goals + result.weeklyPlans + result.todos;
  if (total > 0) {
    console.info(
      `기존 데이터를 GitHub id ${user.githubId} (${user.username}) 에게 귀속했습니다: 목표 ${result.goals}, 주간계획 ${result.weeklyPlans}, 할 일 ${result.todos}`,
    );
  }
  return result;
}
