"use client";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect } from "react";
import { STATUS_LABEL, type PlanWithProgress, type TodoDto } from "@/lib/client/api";
import { useBoard } from "@/lib/client/useBoard";
import { TODO_STATUSES, type TodoStatus } from "@/lib/domain/status";
import { addDays, weekdayIndex } from "@/lib/domain/week";
import { ProgressBar } from "./ProgressBar";

const DAYS = [
  { value: "", label: "전체" },
  { value: "mon", label: "월" },
  { value: "tue", label: "화" },
  { value: "wed", label: "수" },
  { value: "thu", label: "목" },
  { value: "fri", label: "금" },
  { value: "sat", label: "토" },
  { value: "sun", label: "일" },
];
const COLUMN_PREFIX = "column:";

function Card({ todo, plan }: { todo: TodoDto; plan?: PlanWithProgress }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  return (
    <li
      ref={setNodeRef}
      className={`card${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`card-${todo.id}`}
      aria-label={`${todo.title} (${STATUS_LABEL[todo.status]})`}
      {...attributes}
      {...listeners}
    >
      <span className="card-title">{todo.title}</span>
      <span className="card-meta">
        {plan && <span className="badge">{plan.title}</span>}
        <small className="muted">
          {todo.date} ({DAYS[weekdayIndex(todo.date) + 1].label})
        </small>
      </span>
    </li>
  );
}

function Column({ status, todos, plans }: { status: TodoStatus; todos: TodoDto[]; plans: Map<string, PlanWithProgress> }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });
  return (
    <section className={`column${isOver ? " over" : ""}`} aria-label={`${STATUS_LABEL[status]} 컬럼`} data-testid={`column-${status}`}>
      <h3>
        {STATUS_LABEL[status]} <span className="count">{todos.length}</span>
      </h3>
      <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="cards">
          {todos.map((t) => (
            <Card key={t.id} todo={t} plan={plans.get(t.weeklyPlanId)} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

/** Weekly kanban board: todo / doing / done columns for all plans of the selected week. */
export function Board({ initialWeek }: { initialWeek: string }) {
  const board = useBoard(initialWeek);
  const { data, columns, toast, dismissToast } = board;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || !columns || !data) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith(COLUMN_PREFIX)) {
      const status = overId.slice(COLUMN_PREFIX.length) as TodoStatus;
      const rest = columns[status].filter((t) => t.id !== activeId);
      void board.moveCard(activeId, status, rest.length);
      return;
    }
    const overCard = data.todos.find((t) => t.id === overId);
    if (!overCard) return;
    const rest = columns[overCard.status].filter((t) => t.id !== activeId);
    const idx = rest.findIndex((t) => t.id === overId);
    const rect = active.rect.current.translated;
    const below = rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : false;
    void board.moveCard(activeId, overCard.status, idx < 0 ? rest.length : idx + (below ? 1 : 0));
  }

  const plans = new Map((data?.plans ?? []).map((p) => [p.id, p]));

  // Korean screen-reader announcements for the drag lifecycle.
  const titleOf = (id: UniqueIdentifier) => data?.todos.find((t) => t.id === id)?.title ?? "카드";
  const placeOf = (id: UniqueIdentifier) => {
    const key = String(id);
    if (key.startsWith(COLUMN_PREFIX)) return `${STATUS_LABEL[key.slice(COLUMN_PREFIX.length) as TodoStatus]} 컬럼`;
    const card = data?.todos.find((t) => t.id === key);
    return card ? `${STATUS_LABEL[card.status]} 컬럼의 ‘${card.title}’` : "알 수 없는 위치";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `‘${titleOf(active.id)}’ 카드를 집었습니다.`,
    onDragOver: ({ active, over }) =>
      over ? `‘${titleOf(active.id)}’ 카드가 ${placeOf(over.id)} 위에 있습니다.` : `‘${titleOf(active.id)}’ 카드가 놓을 수 있는 영역 밖에 있습니다.`,
    onDragEnd: ({ active, over }) =>
      over ? `‘${titleOf(active.id)}’ 카드를 ${placeOf(over.id)}에 놓았습니다.` : `‘${titleOf(active.id)}’ 카드를 놓지 않았습니다.`,
    onDragCancel: ({ active }) => `‘${titleOf(active.id)}’ 카드 이동을 취소했습니다.`,
  };
  const weekStart = data?.weekStart ?? board.week;

  return (
    <div className="board">
      <div className="toolbar">
        <div className="week-nav">
          <button type="button" onClick={() => board.setWeek(addDays(weekStart, -7))} aria-label="이전 주">
            ◀ 이전 주
          </button>
          <strong data-testid="week-range">
            {weekStart} ~ {data?.weekEnd ?? addDays(weekStart, 6)}
          </strong>
          <button type="button" onClick={() => board.setWeek(addDays(weekStart, 7))} aria-label="다음 주">
            다음 주 ▶
          </button>
          {data && data.previousWeekIncomplete > 0 && (
            <button type="button" className="badge-button" onClick={() => board.setWeek(addDays(weekStart, -7))}>
              지난 주 미완료 {data.previousWeekIncomplete}건
            </button>
          )}
        </div>
        <label className="inline-field">
          <span>주간계획</span>
          <select value={board.weeklyPlanId} onChange={(e) => board.setWeeklyPlanId(e.target.value)} aria-label="주간계획 필터">
            <option value="">전체 주간계획</option>
            {data?.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="day-tabs" role="group" aria-label="요일">
        {DAYS.map((d) => (
          <button
            key={d.value || "all"}
            type="button"
            aria-pressed={board.day === d.value}
            className={board.day === d.value ? "active" : ""}
            onClick={() => board.setDay(d.value)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {board.error && (
        <p className="banner" role="alert">
          {board.error}
        </p>
      )}

      {data && (
        <section className="plan-progress" aria-label="주간계획 진행률">
          {data.plans.length === 0 ? (
            <p className="muted">이 주에는 주간계획이 없습니다. 관리 화면에서 주간계획을 추가하세요.</p>
          ) : (
            data.plans.map((p) => (
              <div key={p.id} className="plan-progress-item">
                <span>{p.title}</span>
                <ProgressBar progress={p.progress} label={p.title} />
              </div>
            ))
          )}
        </section>
      )}

      {columns ? (
        <DndContext
          id="kanban-board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable: "스페이스 또는 엔터로 카드를 집고, 방향키로 옮긴 뒤 다시 스페이스 또는 엔터로 놓습니다. Esc로 취소합니다.",
            },
          }}
        >
          <div className="columns">
            {TODO_STATUSES.map((s) => (
              <Column key={s} status={s} todos={columns[s]} plans={plans} />
            ))}
          </div>
        </DndContext>
      ) : (
        !board.error && <p className="muted">불러오는 중…</p>
      )}

      {toast && (
        <div className="toast" role="alert">
          {toast}
          <button type="button" onClick={dismissToast} aria-label="알림 닫기">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
