import { handleAuthed, parseBody } from "@/lib/http";
import { createTodo, listTodos } from "@/lib/repo/todos";
import { todoCreateSchema } from "@/lib/validation";

/** Optional filter: ?weeklyPlanId=… */
export async function GET(req: Request) {
  return handleAuthed(req, (owner) => listTodos(owner, { weeklyPlanId: new URL(req.url).searchParams.get("weeklyPlanId") ?? undefined }));
}

export async function POST(req: Request) {
  return handleAuthed(req, async (owner) => createTodo(owner, await parseBody(req, todoCreateSchema)), 201);
}
