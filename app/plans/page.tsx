import type { Metadata } from "next";
import { connection } from "next/server";
import { ManageView } from "@/components/ManageView";
import { requirePageUser } from "@/lib/auth/page";
import { today, weekStart } from "@/lib/domain/week";

export const metadata: Metadata = { title: "주간계획 · 칸반 목표 할 일" };

export default async function Page() {
  await requirePageUser();
  await connection(); // defaults (this week / this year) depend on the request time (APP_TIMEZONE)
  const thisWeek = weekStart(today());
  return (
    <>
      <h1>주간계획</h1>
      <ManageView view="plans" thisWeek={thisWeek} thisYear={Number(thisWeek.slice(0, 4))} />
    </>
  );
}
