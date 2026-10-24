import { handleAuthed, parseBody } from "@/lib/http";
import { deleteGoal, getGoal, updateGoal } from "@/lib/repo/goals";
import { goalUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/goals/[id]">;

/** Includes `progress` and `descendants` (counts shown before deleting). */
export async function GET(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => getGoal(owner, (await ctx.params).id));
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => updateGoal(owner, (await ctx.params).id, await parseBody(req, goalUpdateSchema)));
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => deleteGoal(owner, (await ctx.params).id));
}
