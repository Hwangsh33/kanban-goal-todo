import { handleAuthed } from "@/lib/http";
import { getGoalProgress } from "@/lib/repo/goals";

export async function GET(req: Request, ctx: RouteContext<"/api/goals/[id]/progress">) {
  return handleAuthed(req, async (owner) => getGoalProgress(owner, (await ctx.params).id));
}
