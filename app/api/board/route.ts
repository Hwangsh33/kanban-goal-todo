import { handleAuthed } from "@/lib/http";
import { getBoard } from "@/lib/repo/board";

/** ?week=YYYY-MM-DD (any day of the week, default: this week) &weeklyPlanId=… &day=mon…sun */
export async function GET(req: Request) {
  return handleAuthed(req, (owner) => {
    const params = new URL(req.url).searchParams;
    return getBoard(owner, { week: params.get("week"), weeklyPlanId: params.get("weeklyPlanId"), day: params.get("day") });
  });
}
