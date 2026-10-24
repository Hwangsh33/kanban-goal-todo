import { handleAuthed } from "@/lib/http";
import { deleteFromTrash } from "@/lib/repo/trash";
import { trashRestoreSchema } from "@/lib/validation";

/** Permanently deletes a trashed item (type: goal | weeklyPlan | todo) and its descendants. 404 if not in the trash. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/trash/[type]/[id]">) {
  return handleAuthed(req, async (owner) => deleteFromTrash(owner, trashRestoreSchema.parse(await ctx.params)));
}
