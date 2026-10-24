import { connection } from "next/server";
import { Board } from "@/components/Board";
import { requirePageUser } from "@/lib/auth/page";
import { today, weekStart } from "@/lib/domain/week";

export default async function BoardPage() {
  await requirePageUser();
  await connection(); // "this week" depends on the request time (APP_TIMEZONE)
  return (
    <>
      <h1>대시보드</h1>
      <Board initialWeek={weekStart(today())} />
    </>
  );
}
