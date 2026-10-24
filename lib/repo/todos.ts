import { computeMoveOrder, NeighborNotFoundError, orderBetween } from "@/lib/domain/order";
import type { TodoStatus } from "@/lib/domain/status";
import { defaultTodoDate, isInWeek, shiftDateToWeek, today, weekEnd } from "@/lib/domain/week";
import { badRequest, notFound } from "@/lib/errors";
import { Todo, type TodoDoc } from "@/lib/models";
import type { TodoCreateInput, TodoMoveInput, TodoUpdateInput } from "@/lib/validation";
import { todoDto, type TodoDto } from "./dto";
import { PLAN_NOT_FOUND } from "./weeklyPlans";
import { findActiveTodos, getActivePlan, getActiveTodo, toObjectId, type OwnerId } from "./visibility";

const TODO_NOT_FOUND = "할 일을 찾을 수 없습니다";

const outOfWeek = (weekStart: string) =>
  badRequest(`날짜는 주간계획의 주 범위(${weekStart} ~ ${weekEnd(weekStart)}) 안이어야 합니다`);

/** Active todos of one board column: same week (any active plan of that week) and status. */
async function column(owner: OwnerId, weekStart: string, status: TodoStatus, excludeId?: TodoDoc["_id"]) {
  const filter = excludeId ? { status, _id: { $ne: excludeId } } : { status };
  return findActiveTodos(owner, filter, { weekStart });
}

export async function listTodos(owner: OwnerId, query: { weeklyPlanId?: string } = {}): Promise<TodoDto[]> {
  if (query.weeklyPlanId === undefined) return (await findActiveTodos(owner)).map(todoDto);
  const planId = toObjectId(query.weeklyPlanId);
  if (!planId) return [];
  return (await findActiveTodos(owner, { weeklyPlanId: planId })).map(todoDto);
}

export async function getTodo(owner: OwnerId, id: string): Promise<TodoDto> {
  const found = await getActiveTodo(owner, id);
  if (!found) throw notFound(TODO_NOT_FOUND);
  return todoDto(found.todo);
}

export async function createTodo(owner: OwnerId, input: TodoCreateInput, todayDate: string = today()): Promise<TodoDto> {
  const plan = await getActivePlan(owner, input.weeklyPlanId);
  if (!plan) throw badRequest(PLAN_NOT_FOUND);

  const date = input.date ?? defaultTodoDate(plan.weekStart, todayDate);
  if (!isInWeek(date, plan.weekStart)) throw outOfWeek(plan.weekStart);

  const last = (await column(owner, plan.weekStart, "todo")).at(-1);
  const todo = await Todo.create({
    title: input.title,
    status: "todo",
    date,
    dueDate: input.dueDate ?? null,
    order: orderBetween(last?.order, null),
    weeklyPlanId: plan._id,
    userId: owner,
  });
  return todoDto(todo.toObject());
}

/**
 * Updates title / weekly plan / date / dueDate. Moving to a plan of another week keeps the
 * weekday of `date` and appends the card to the end of its status column in that week; an
 * explicit `date` must lie inside the (resulting) plan's week.
 */
export async function updateTodo(owner: OwnerId, id: string, input: TodoUpdateInput): Promise<TodoDto> {
  const found = await getActiveTodo(owner, id);
  if (!found) throw notFound(TODO_NOT_FOUND);
  const { todo, plan } = found;

  let target = plan;
  if (input.weeklyPlanId !== undefined && input.weeklyPlanId !== String(plan._id)) {
    const next = await getActivePlan(owner, input.weeklyPlanId);
    if (!next) throw badRequest(PLAN_NOT_FOUND);
    target = next;
  }

  const date = input.date ?? shiftDateToWeek(todo.date, plan.weekStart, target.weekStart);
  if (!isInWeek(date, target.weekStart)) throw outOfWeek(target.weekStart);

  const set: Partial<TodoDoc> = { date, weeklyPlanId: target._id };
  if (input.title !== undefined) set.title = input.title;
  if (input.dueDate !== undefined) set.dueDate = input.dueDate;
  if (target.weekStart !== plan.weekStart) {
    const last = (await column(owner, target.weekStart, todo.status, todo._id)).at(-1);
    set.order = orderBetween(last?.order, null);
  }

  const updated = await Todo.findOneAndUpdate(
    { _id: todo._id, userId: owner, deletedAt: null },
    { $set: set },
    { returnDocument: "after" },
  ).lean<TodoDoc>();
  if (!updated) throw notFound(TODO_NOT_FOUND);
  return todoDto(updated);
}

/** Tombstones only the todo document. */
export async function deleteTodo(owner: OwnerId, id: string, now: Date = new Date()) {
  const found = await getActiveTodo(owner, id);
  if (!found) throw notFound(TODO_NOT_FOUND);
  await Todo.updateOne({ _id: found.todo._id, userId: owner, deletedAt: null }, { $set: { deletedAt: now } });
  return { type: "todo" as const, id, deletedAt: now.toISOString(), descendants: {} };
}

/**
 * Drag & drop move. Applied only when `seq` is greater than the card's `lastSeq` (conditional
 * update), so a stale request arriving late never overwrites a newer move; in that case the
 * current state is returned with `applied: false`. `renumbered: true` means other cards of the
 * column got new orders too, so clients should reload the column.
 */
export async function moveTodo(
  owner: OwnerId,
  id: string,
  input: TodoMoveInput,
): Promise<{ applied: boolean; renumbered: boolean; todo: TodoDto }> {
  const found = await getActiveTodo(owner, id);
  if (!found) throw notFound(TODO_NOT_FOUND);
  const { todo, plan } = found;
  if (input.seq <= todo.lastSeq) return { applied: false, renumbered: false, todo: todoDto(todo) };

  const cards = await column(owner, plan.weekStart, input.status, todo._id);
  let placement;
  try {
    placement = computeMoveOrder(
      cards.map((c) => ({ id: String(c._id), order: c.order })),
      { beforeId: input.beforeId, afterId: input.afterId },
    );
  } catch (err) {
    if (err instanceof NeighborNotFoundError) throw badRequest(err.message);
    throw err;
  }

  const updated = await Todo.findOneAndUpdate(
    { _id: todo._id, userId: owner, deletedAt: null, lastSeq: { $lt: input.seq } },
    { $set: { status: input.status, order: placement.order, lastSeq: input.seq } },
    { returnDocument: "after" },
  ).lean<TodoDoc>();

  if (!updated) {
    const current = await getActiveTodo(owner, id);
    if (!current) throw notFound(TODO_NOT_FOUND);
    return { applied: false, renumbered: false, todo: todoDto(current.todo) };
  }

  if (placement.renumbered) {
    // Scoped to the column the orders were computed for: a card that left it meanwhile is skipped.
    const planOf = new Map(cards.map((c) => [String(c._id), c.weeklyPlanId]));
    await Todo.bulkWrite(
      placement.renumbered.map((c) => ({
        updateOne: {
          filter: { _id: toObjectId(c.id), userId: owner, weeklyPlanId: planOf.get(c.id), status: input.status, deletedAt: null },
          update: { $set: { order: c.order } },
        },
      })),
    );
  }
  return { applied: true, renumbered: placement.renumbered !== null, todo: todoDto(updated) };
}
