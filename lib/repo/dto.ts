import type { Progress } from "@/lib/domain/progress";
import type { TodoStatus } from "@/lib/domain/status";
import type { GoalDoc, TodoDoc, WeeklyPlanDoc } from "@/lib/models";

export type GoalDto = { id: string; title: string; year: number; deletedAt: string | null };
export type WeeklyPlanDto = {
  id: string;
  title: string;
  weekStart: string;
  goalId: string;
  deletedAt: string | null;
};
export type TodoDto = {
  id: string;
  title: string;
  status: TodoStatus;
  date: string;
  dueDate: string | null;
  order: number;
  lastSeq: number;
  weeklyPlanId: string;
  deletedAt: string | null;
};
export type WithProgress<T> = T & { progress: Progress };

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export function goalDto(g: GoalDoc): GoalDto {
  return { id: String(g._id), title: g.title, year: g.year, deletedAt: iso(g.deletedAt) };
}

export function weeklyPlanDto(p: WeeklyPlanDoc): WeeklyPlanDto {
  return {
    id: String(p._id),
    title: p.title,
    weekStart: p.weekStart,
    goalId: String(p.goalId),
    deletedAt: iso(p.deletedAt),
  };
}

export function todoDto(t: TodoDoc): TodoDto {
  return {
    id: String(t._id),
    title: t.title,
    status: t.status as TodoStatus,
    date: t.date,
    dueDate: t.dueDate ?? null,
    order: t.order,
    lastSeq: t.lastSeq,
    weeklyPlanId: String(t.weeklyPlanId),
    deletedAt: iso(t.deletedAt),
  };
}
