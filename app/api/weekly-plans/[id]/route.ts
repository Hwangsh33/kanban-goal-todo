import { handleAuthed, parseBody } from "@/lib/http";
import { deleteWeeklyPlan, getWeeklyPlan, updateWeeklyPlan } from "@/lib/repo/weeklyPlans";
import { weeklyPlanUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/weekly-plans/[id]">;

/** Includes `progress` and `descendants` (counts shown before deleting). */
export async function GET(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => getWeeklyPlan(owner, (await ctx.params).id));
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => updateWeeklyPlan(owner, (await ctx.params).id, await parseBody(req, weeklyPlanUpdateSchema)));
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => deleteWeeklyPlan(owner, (await ctx.params).id));
}
