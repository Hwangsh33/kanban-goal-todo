import { handleAuthed, parseBody } from "@/lib/http";
import { deleteTodo, getTodo, updateTodo } from "@/lib/repo/todos";
import { todoUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/todos/[id]">;

export async function GET(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => getTodo(owner, (await ctx.params).id));
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => updateTodo(owner, (await ctx.params).id, await parseBody(req, todoUpdateSchema)));
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleAuthed(req, async (owner) => deleteTodo(owner, (await ctx.params).id));
}
