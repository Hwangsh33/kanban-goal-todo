import type { Progress } from "@/lib/domain/progress";
import type { TodoStatus } from "@/lib/domain/status";
import type { GoalDto, TodoDto, WeeklyPlanDto, WithProgress } from "@/lib/repo/dto";

/** Browser-side client for the JSON API (the only way the UI reads or writes data). */

export type { GoalDto, Progress, TodoDto, TodoStatus, WeeklyPlanDto };
export type GoalWithProgress = WithProgress<GoalDto>;
export type PlanWithProgress = WithProgress<WeeklyPlanDto>;
export type ItemType = "goal" | "weeklyPlan" | "todo";
export type Descendants = { weeklyPlans?: number; todos?: number };
export type ParentRef = { type: "goal" | "weeklyPlan"; id: string };

export type BoardData = {
  weekStart: string;
  weekEnd: string;
  plans: PlanWithProgress[];
  todos: TodoDto[];
  previousWeekIncomplete: number;
};

export type TrashItem = {
  type: ItemType;
  id: string;
  title: string;
  deletedAt: string;
  descendants: Descendants;
  deletedParent: ParentRef | null;
};

export type MoveInput = { status: TodoStatus; beforeId?: string | null; afterId?: string | null; seq: number };
export type MoveResult = { applied: boolean; renumbered: boolean; todo: TodoDto };

/** Non-2xx response: `message` is the server's (Korean) error text, `body` the full JSON body. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없습니다", {});
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, typeof json.error === "string" ? json.error : "요청에 실패했습니다", json);
  }
  return json as T;
}

const resourcePath: Record<ItemType, string> = {
  goal: "/api/goals",
  weeklyPlan: "/api/weekly-plans",
  todo: "/api/todos",
};

export const api = {
  goals: {
    list: () => request<GoalWithProgress[]>("GET", "/api/goals"),
    create: (body: { title: string; year: number }) => request<GoalDto>("POST", "/api/goals", body),
    update: (id: string, body: { title?: string; year?: number }) =>
      request<GoalDto>("PATCH", `/api/goals/${id}`, body),
  },
  plans: {
    list: () => request<PlanWithProgress[]>("GET", "/api/weekly-plans"),
    create: (body: { title: string; weekStart: string; goalId: string }) =>
      request<WeeklyPlanDto>("POST", "/api/weekly-plans", body),
    update: (id: string, body: { title?: string; weekStart?: string; goalId?: string }) =>
      request<WeeklyPlanDto>("PATCH", `/api/weekly-plans/${id}`, body),
    progress: (id: string) => request<Progress>("GET", `/api/weekly-plans/${id}/progress`),
  },
  todos: {
    list: () => request<TodoDto[]>("GET", "/api/todos"),
    create: (body: { title: string; weeklyPlanId: string; date?: string }) =>
      request<TodoDto>("POST", "/api/todos", body),
    update: (id: string, body: { title?: string; weeklyPlanId?: string; date?: string }) =>
      request<TodoDto>("PATCH", `/api/todos/${id}`, body),
    move: (id: string, body: MoveInput) => request<MoveResult>("PATCH", `/api/todos/${id}/move`, body),
  },
  /** GET of a goal/plan includes `descendants` (shown in the delete dialog). */
  descendants: async (type: ItemType, id: string): Promise<Descendants> => {
    if (type === "todo") return {};
    const item = await request<{ descendants: Descendants }>("GET", `${resourcePath[type]}/${id}`);
    return item.descendants;
  },
  remove: (type: ItemType, id: string) => request<{ descendants: Descendants }>("DELETE", `${resourcePath[type]}/${id}`),
  board: (query: { week?: string; weeklyPlanId?: string; day?: string }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const qs = params.toString();
    return request<BoardData>("GET", `/api/board${qs ? `?${qs}` : ""}`);
  },
  trash: {
    list: () => request<TrashItem[]>("GET", "/api/trash"),
    restore: (type: ItemType, id: string) => request<unknown>("POST", "/api/trash/restore", { type, id }),
    purge: (type: ItemType, id: string) => request<unknown>("DELETE", `/api/trash/${type}/${id}`),
  },
};

export const TYPE_LABEL: Record<ItemType, string> = { goal: "1년 목표", weeklyPlan: "주간계획", todo: "할 일" };
export const STATUS_LABEL: Record<TodoStatus, string> = { todo: "할 일", doing: "진행 중", done: "완료" };
