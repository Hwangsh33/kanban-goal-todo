import type { QueryFilter } from "mongoose";
import { progressSummary } from "@/lib/domain/progress";
import { addDays, isDateString, today, weekEnd, weekStart } from "@/lib/domain/week";
import { badRequest } from "@/lib/errors";
import type { TodoDoc } from "@/lib/models";
import { todoDto, weeklyPlanDto } from "./dto";
import { activeTodoCountsByPlan, countActiveTodos, findActivePlans, findActiveTodos, toObjectId, type OwnerId } from "./visibility";

const BOARD_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type BoardDay = (typeof BOARD_DAYS)[number];

export type BoardQuery = { week?: string | null; weeklyPlanId?: string | null; day?: string | null };

/**
 * Board for one week: active plans whose weekStart is that week's Monday (with progress), their
 * active todos sorted by order, optionally filtered by plan and weekday, plus the number of
 * unfinished active todos of the previous week.
 */
export async function getBoard(owner: OwnerId, query: BoardQuery, todayDate: string = today()) {
  const week = query.week || todayDate;
  if (!isDateString(week)) throw badRequest("week는 YYYY-MM-DD 형식이어야 합니다");
  const ws = weekStart(week);

  const todoFilter: QueryFilter<TodoDoc> = {};
  if (query.day) {
    const idx = BOARD_DAYS.indexOf(query.day as BoardDay);
    if (idx < 0) throw badRequest("day는 mon~sun 중 하나여야 합니다");
    todoFilter.date = addDays(ws, idx);
  }
  if (query.weeklyPlanId) {
    const planId = toObjectId(query.weeklyPlanId);
    if (!planId) throw badRequest("주간계획을 찾을 수 없습니다");
    todoFilter.weeklyPlanId = planId;
  }

  const [plans, counts, todos, previousWeekIncomplete] = await Promise.all([
    findActivePlans(owner, { weekStart: ws }),
    activeTodoCountsByPlan(owner, { weekStart: ws }),
    findActiveTodos(owner, todoFilter, { weekStart: ws }),
    countActiveTodos(owner, { status: { $ne: "done" } }, { weekStart: addDays(ws, -7) }),
  ]);

  return {
    weekStart: ws,
    weekEnd: weekEnd(ws),
    plans: plans.map((p) => {
      const c = counts.get(String(p._id)) ?? { done: 0, total: 0 };
      return { ...weeklyPlanDto(p), progress: progressSummary(c.done, c.total) };
    }),
    todos: todos.map(todoDto),
    previousWeekIncomplete,
  };
}
