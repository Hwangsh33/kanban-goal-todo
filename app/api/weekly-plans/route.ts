import { handleAuthed, parseBody } from "@/lib/http";
import { createWeeklyPlan, listWeeklyPlans } from "@/lib/repo/weeklyPlans";
import { weeklyPlanCreateSchema } from "@/lib/validation";

/** Optional filters: ?goalId=…&weekStart=YYYY-MM-DD */
export async function GET(req: Request) {
  return handleAuthed(req, (owner) => {
    const params = new URL(req.url).searchParams;
    return listWeeklyPlans(owner, {
      goalId: params.get("goalId") ?? undefined,
      weekStart: params.get("weekStart") ?? undefined,
    });
  });
}

export async function POST(req: Request) {
  return handleAuthed(req, async (owner) => createWeeklyPlan(owner, await parseBody(req, weeklyPlanCreateSchema)), 201);
}
