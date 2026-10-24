import { handleAuthed } from "@/lib/http";
import { getWeeklyPlanProgress } from "@/lib/repo/weeklyPlans";

export async function GET(req: Request, ctx: RouteContext<"/api/weekly-plans/[id]/progress">) {
  return handleAuthed(req, async (owner) => getWeeklyPlanProgress(owner, (await ctx.params).id));
}
