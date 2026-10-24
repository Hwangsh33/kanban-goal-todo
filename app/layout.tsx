import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getPageUser } from "@/lib/auth/page";
import "./globals.css";

export const metadata: Metadata = {
  title: "칸반 목표 할 일",
  description: "1년 목표 · 주간계획 · 할 일 칸반",
};

/**
 * The nav user. If the lookup fails (e.g. MongoDB is down) every page — /login included — would
 * otherwise become a 500, so the logged-out shell is rendered instead. Protected pages still run
 * their own requirePageUser() check. Next.js control-flow errors (redirect, dynamic usage) pass through.
 */
async function navUser() {
  try {
    return await getPageUser();
  } catch (err) {
    unstable_rethrow(err);
    // Fixed message only: error details (hosts, connection strings) stay out of the logs.
    console.error("레이아웃: 사용자 정보를 불러오지 못했습니다. 로그아웃 상태 화면을 표시합니다");
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await navUser();
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          {/* Only what the nav shows is passed to the client component (no ids). */}
          <Sidebar user={user && { username: user.username, avatarUrl: user.avatarUrl }} />
          <main className="container">{children}</main>
        </div>
      </body>
    </html>
  );
}
