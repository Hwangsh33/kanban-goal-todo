import { handleAuthed, parseBody } from "@/lib/http";
import { createGoal, listGoals } from "@/lib/repo/goals";
import { goalCreateSchema } from "@/lib/validation";

export async function GET(req: Request) {
  return handleAuthed(req, (owner) => listGoals(owner));
}

export async function POST(req: Request) {
  return handleAuthed(req, async (owner) => createGoal(owner, await parseBody(req, goalCreateSchema)), 201);
}
