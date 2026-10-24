import { handleAuthed, parseBody } from "@/lib/http";
import { restoreFromTrash } from "@/lib/repo/trash";
import { trashRestoreSchema } from "@/lib/validation";

/** Body: { type: "goal" | "weeklyPlan" | "todo", id }. 409 while an ancestor is still deleted. */
export async function POST(req: Request) {
  return handleAuthed(req, async (owner) => restoreFromTrash(owner, await parseBody(req, trashRestoreSchema)));
}
