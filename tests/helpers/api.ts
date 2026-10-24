import * as boardRoute from "@/app/api/board/route";
import * as goalRoute from "@/app/api/goals/[id]/route";
import * as goalProgressRoute from "@/app/api/goals/[id]/progress/route";
import * as goalsRoute from "@/app/api/goals/route";
import * as todoMoveRoute from "@/app/api/todos/[id]/move/route";
import * as todoRoute from "@/app/api/todos/[id]/route";
import * as todosRoute from "@/app/api/todos/route";
import * as trashItemRoute from "@/app/api/trash/[type]/[id]/route";
import * as trashRestoreRoute from "@/app/api/trash/restore/route";
import * as trashRoute from "@/app/api/trash/route";
import * as planProgressRoute from "@/app/api/weekly-plans/[id]/progress/route";
import * as planRoute from "@/app/api/weekly-plans/[id]/route";
import * as plansRoute from "@/app/api/weekly-plans/route";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ApiResult = { status: number; body: any };

/** Cookie header sent by `api` (set per test by setupAuth() in ./auth). */
let apiCookie: string | undefined;
export function setApiCookie(cookie: string | undefined): void {
  apiCookie = cookie;
}

function req(method: string, path: string, body?: unknown, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function result(res: Response): Promise<ApiResult> {
  return { status: res.status, body: await res.json() };
}

/**
 * Calls the real route handlers with Request objects (no HTTP server), sending the cookie returned
 * by `getCookie` (undefined = not logged in).
 */
function client(getCookie: () => string | undefined) {
  const request = (method: string, path: string, body?: unknown) => req(method, path, body, getCookie());
  return {
    goals: {
      list: async () => result(await goalsRoute.GET(request("GET", "/api/goals"))),
      create: async (body: unknown) => result(await goalsRoute.POST(request("POST", "/api/goals", body))),
      get: async (id: string) => result(await goalRoute.GET(request("GET", `/api/goals/${id}`), ctx(id))),
      update: async (id: string, body: unknown) =>
        result(await goalRoute.PATCH(request("PATCH", `/api/goals/${id}`, body), ctx(id))),
      remove: async (id: string) => result(await goalRoute.DELETE(request("DELETE", `/api/goals/${id}`), ctx(id))),
      progress: async (id: string) =>
        result(await goalProgressRoute.GET(request("GET", `/api/goals/${id}/progress`), ctx(id))),
    },
    plans: {
      list: async (query = "") => result(await plansRoute.GET(request("GET", `/api/weekly-plans${query}`))),
      create: async (body: unknown) => result(await plansRoute.POST(request("POST", "/api/weekly-plans", body))),
      get: async (id: string) => result(await planRoute.GET(request("GET", `/api/weekly-plans/${id}`), ctx(id))),
      update: async (id: string, body: unknown) =>
        result(await planRoute.PATCH(request("PATCH", `/api/weekly-plans/${id}`, body), ctx(id))),
      remove: async (id: string) =>
        result(await planRoute.DELETE(request("DELETE", `/api/weekly-plans/${id}`), ctx(id))),
      progress: async (id: string) =>
        result(await planProgressRoute.GET(request("GET", `/api/weekly-plans/${id}/progress`), ctx(id))),
    },
    todos: {
      list: async (query = "") => result(await todosRoute.GET(request("GET", `/api/todos${query}`))),
      create: async (body: unknown) => result(await todosRoute.POST(request("POST", "/api/todos", body))),
      get: async (id: string) => result(await todoRoute.GET(request("GET", `/api/todos/${id}`), ctx(id))),
      update: async (id: string, body: unknown) =>
        result(await todoRoute.PATCH(request("PATCH", `/api/todos/${id}`, body), ctx(id))),
      remove: async (id: string) => result(await todoRoute.DELETE(request("DELETE", `/api/todos/${id}`), ctx(id))),
      move: async (id: string, body: unknown) =>
        result(await todoMoveRoute.PATCH(request("PATCH", `/api/todos/${id}/move`, body), ctx(id))),
    },
    trash: {
      list: async () => result(await trashRoute.GET(request("GET", "/api/trash"))),
      restore: async (body: unknown) =>
        result(await trashRestoreRoute.POST(request("POST", "/api/trash/restore", body))),
      purge: async (type: string, id: string) =>
        result(
          await trashItemRoute.DELETE(request("DELETE", `/api/trash/${type}/${id}`), {
            params: Promise.resolve({ type, id }),
          }),
        ),
    },
    board: async (query = "") => result(await boardRoute.GET(request("GET", `/api/board${query}`))),
  };
}

export type ApiClient = ReturnType<typeof client>;

/** Client of the current test user (see setupAuth). */
export const api = client(() => apiCookie);

/** Client with an explicit cookie (another user, or undefined for an anonymous request). */
export const apiAs = (cookie: string | undefined): ApiClient => client(() => cookie);

/** Creates goal → plan → n todos through the API and returns their ids. */
export async function seed(opts: { year?: number; weekStart?: string; todos?: number } = {}, as: ApiClient = api) {
  const year = opts.year ?? 2030;
  const weekStart = opts.weekStart ?? "2030-03-04";
  const goal = await as.goals.create({ title: "목표", year });
  const plan = await as.plans.create({ title: "주간계획", weekStart, goalId: goal.body.id });
  const todoIds: string[] = [];
  for (let i = 0; i < (opts.todos ?? 0); i++) {
    const todo = await as.todos.create({ title: `할 일 ${i + 1}`, weeklyPlanId: plan.body.id });
    todoIds.push(todo.body.id);
  }
  return { goalId: goal.body.id as string, planId: plan.body.id as string, todoIds };
}
