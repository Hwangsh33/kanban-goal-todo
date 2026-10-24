import { z } from "zod";
import { TODO_STATUSES } from "@/lib/domain/status";
import { isDateString, isMonday } from "@/lib/domain/week";

const MSG = {
  title: "제목을 입력하세요",
  titleTooLong: "제목은 200자 이하로 입력하세요",
  year: "연도를 입력하세요",
  date: "날짜는 YYYY-MM-DD 형식이어야 합니다",
  monday: "주 시작일(weekStart)은 월요일이어야 합니다",
  goal: "1년 목표를 선택하세요",
  plan: "주간계획을 선택하세요",
  status: "상태는 todo, doing, done 중 하나여야 합니다",
  seq: "seq는 1 이상의 정수여야 합니다",
} as const;

const title = z.string({ error: MSG.title }).trim().min(1, MSG.title).max(200, MSG.titleTooLong);
const year = z.number({ error: MSG.year }).int(MSG.year).min(1970, MSG.year).max(9999, MSG.year);
const date = z.string({ error: MSG.date }).refine(isDateString, MSG.date);
const mondayDate = date.refine(isMonday, MSG.monday);
const requiredId = (message: string) => z.string({ error: message }).trim().min(1, message);

export const goalCreateSchema = z.object({ title, year });
export const goalUpdateSchema = z.object({ title: title.optional(), year: year.optional() });

export const weeklyPlanCreateSchema = z.object({
  title,
  weekStart: mondayDate,
  goalId: requiredId(MSG.goal),
});
export const weeklyPlanUpdateSchema = z.object({
  title: title.optional(),
  weekStart: mondayDate.optional(),
  goalId: requiredId(MSG.goal).optional(),
});

export const todoCreateSchema = z.object({
  title,
  weeklyPlanId: requiredId(MSG.plan),
  date: date.optional(),
  dueDate: date.optional(),
});
export const todoUpdateSchema = z.object({
  title: title.optional(),
  weeklyPlanId: requiredId(MSG.plan).optional(),
  date: date.optional(),
  dueDate: date.nullable().optional(),
});

export const todoMoveSchema = z.object({
  status: z.enum(TODO_STATUSES, { error: MSG.status }),
  beforeId: z.string().nullish(),
  afterId: z.string().nullish(),
  seq: z.number({ error: MSG.seq }).int(MSG.seq).positive(MSG.seq),
});

export const trashRestoreSchema = z.object({
  type: z.enum(["goal", "weeklyPlan", "todo"], { error: "복원할 항목 종류가 올바르지 않습니다" }),
  id: requiredId("복원할 항목을 선택하세요"),
});

export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;
export type WeeklyPlanCreateInput = z.infer<typeof weeklyPlanCreateSchema>;
export type WeeklyPlanUpdateInput = z.infer<typeof weeklyPlanUpdateSchema>;
export type TodoCreateInput = z.infer<typeof todoCreateSchema>;
export type TodoUpdateInput = z.infer<typeof todoUpdateSchema>;
export type TodoMoveInput = z.infer<typeof todoMoveSchema>;
export type TrashRestoreInput = z.infer<typeof trashRestoreSchema>;
