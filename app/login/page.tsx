import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageUser } from "@/lib/auth/page";

export const metadata: Metadata = { title: "로그인 · 칸반 목표 할 일" };

/** Messages for the fixed error codes set by /auth/github/callback (anything else is ignored). */
const ERROR_MESSAGES: Record<string, string> = {
  denied: "GitHub 로그인이 취소되었습니다. 다시 시도해 주세요.",
  state: "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.",
  github: "GitHub 와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

/**
 * Redirect target for unauthenticated visitors; logged-in users go to the board.
 * A plain <a> (no prefetch): /auth/github sets a cookie and redirects to GitHub.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getPageUser()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" && Object.hasOwn(ERROR_MESSAGES, error) ? ERROR_MESSAGES[error] : null;
  return (
    <section className="login">
      <h1>로그인</h1>
      <p>GitHub 계정으로 로그인하면 내 목표·주간계획·할 일만 볼 수 있습니다.</p>
      {message && (
        <p role="alert" className="login-error">
          {message}
        </p>
      )}
      <p>
        <a className="login-button" href="/auth/github">
          GitHub 로 로그인
        </a>
      </p>
    </section>
  );
}
