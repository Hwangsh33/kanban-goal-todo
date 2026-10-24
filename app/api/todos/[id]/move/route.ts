import { handleAuthed, parseBody } from "@/lib/http";
import { moveTodo } from "@/lib/repo/todos";
import { todoMoveSchema } from "@/lib/validation";

/** Body: { status, beforeId?, afterId?, seq }. Stale seq values are ignored (applied: false). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/todos/[id]/move">) {
  return handleAuthed(req, async (owner) => moveTodo(owner, (await ctx.params).id, await parseBody(req, todoMoveSchema)));
}
