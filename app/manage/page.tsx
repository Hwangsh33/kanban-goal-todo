import type { Metadata } from "next";
import { connection } from "next/server";
import { ManageView } from "@/components/ManageView";
import { requirePageUser } from "@/lib/auth/page";
import { today, weekStart } from "@/lib/domain/week";

export const metadata: Metadata = { title: "관리 · 칸반 목표 할 일" };

export default async function ManagePage() {
  await requirePageUser();
  await connection(); // defaults (this week / this year) depend on the request time (APP_TIMEZONE)
  const thisWeek = weekStart(today());
  return (
    <>
      <h1>목표 · 주간계획 · 할 일 관리</h1>
      <ManageView thisWeek={thisWeek} thisYear={Number(thisWeek.slice(0, 4))} />
    </>
  );
}
