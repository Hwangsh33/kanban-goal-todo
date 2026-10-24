"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  STATUS_LABEL,
  type GoalWithProgress,
  type ItemType,
  type PlanWithProgress,
  type TodoDto,
} from "@/lib/client/api";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { GoalForm, TodoForm, WeeklyPlanForm } from "./Forms";
import { ProgressBar } from "./ProgressBar";
import { useDeleteFlow } from "./useDeleteFlow";

type Data = { goals: GoalWithProgress[]; plans: PlanWithProgress[]; todos: TodoDto[] };
type Editing = { type: ItemType; id: string } | null;

async function loadData(): Promise<Data> {
  const [goals, plans, todos] = await Promise.all([api.goals.list(), api.plans.list(), api.todos.list()]);
  return { goals, plans, todos };
}

/** Goals → weekly plans (with progress bars) → todos: create, edit and delete. */
export function ManageView({
  thisWeek,
  thisYear,
  view = "all",
}: {
  thisWeek: string;
  thisYear: number;
  /** Which add form to show; the goal → plan → todo tree is always shown. */
  view?: "all" | "goals" | "plans" | "todos";
}) {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loadData());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "불러오지 못했습니다");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadData().then(
      (loaded) => !cancelled && setData(loaded),
      (err: Error) => !cancelled && setMessage(err.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const deletion = useDeleteFlow(reload, setMessage);
  const isEditing = (type: ItemType, id: string) => editing?.type === type && editing.id === id;
  const saved = async () => {
    setEditing(null);
    setMessage(null);
    await reload();
  };

  if (!data) return <p className="muted">불러오는 중…</p>;

  return (
    <div className="manage">
      {message && (
        <p className="banner" role="alert">
          {message}
        </p>
      )}

      <div className="manage-forms">
        {(view === "all" || view === "goals") && (
          <section className="panel">
            <h2>1년 목표 추가</h2>
            <GoalForm defaultYear={thisYear} onSubmit={async (v) => { await api.goals.create(v); await saved(); }} />
          </section>
        )}
        {(view === "all" || view === "plans") && (
          <section className="panel">
            <h2>주간계획 추가</h2>
            <WeeklyPlanForm
              goals={data.goals}
              defaultWeekStart={thisWeek}
              onSubmit={async (v) => { await api.plans.create(v); await saved(); }}
            />
          </section>
        )}
        {(view === "all" || view === "todos") && (
          <section className="panel">
            <h2>할 일 추가</h2>
            <TodoForm plans={data.plans} onSubmit={async (v) => { await api.todos.create(v); await saved(); }} />
          </section>
        )}
      </div>

      <section>
        <h2>목표 · 주간계획 · 할 일</h2>
        {data.goals.length === 0 && <p className="muted">아직 1년 목표가 없습니다. 위에서 목표를 추가하세요.</p>}
        {data.goals.map((goal) => (
          <article key={goal.id} className="goal-card" data-testid={`goal-${goal.id}`}>
            {isEditing("goal", goal.id) ? (
              <GoalForm
                initial={{ title: goal.title, year: goal.year }}
                defaultYear={thisYear}
                onCancel={() => setEditing(null)}
                onSubmit={async (v) => { await api.goals.update(goal.id, v); await saved(); }}
              />
            ) : (
              <header className="card-head">
                <h3>
                  {goal.title} <small className="muted">{goal.year}년</small>
                </h3>
                <ProgressBar progress={goal.progress} label={goal.title} />
                <div className="row-actions">
                  <button type="button" onClick={() => setEditing({ type: "goal", id: goal.id })}>수정</button>
                  <button type="button" className="danger" onClick={() => deletion.open({ type: "goal", id: goal.id, title: goal.title })}>
                    삭제
                  </button>
                </div>
              </header>
            )}

            {data.plans
              .filter((p) => p.goalId === goal.id)
              .map((plan) => (
                <div key={plan.id} className="plan-card" data-testid={`plan-${plan.id}`}>
                  {isEditing("weeklyPlan", plan.id) ? (
                    <WeeklyPlanForm
                      goals={data.goals}
                      initial={{ title: plan.title, weekStart: plan.weekStart, goalId: plan.goalId }}
                      defaultWeekStart={thisWeek}
                      onCancel={() => setEditing(null)}
                      onSubmit={async (v) => { await api.plans.update(plan.id, v); await saved(); }}
                    />
                  ) : (
                    <div className="card-head">
                      <h4>
                        {plan.title} <small className="muted">{plan.weekStart} 주</small>
                      </h4>
                      <ProgressBar progress={plan.progress} label={plan.title} />
                      <div className="row-actions">
                        <button type="button" onClick={() => setEditing({ type: "weeklyPlan", id: plan.id })}>수정</button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => deletion.open({ type: "weeklyPlan", id: plan.id, title: plan.title })}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                  <ul className="todo-list">
                    {data.todos
                      .filter((t) => t.weeklyPlanId === plan.id)
                      .map((todo) => (
                        <li key={todo.id}>
                          {isEditing("todo", todo.id) ? (
                            <TodoForm
                              plans={data.plans}
                              initial={{ title: todo.title, weeklyPlanId: todo.weeklyPlanId, date: todo.date }}
                              onCancel={() => setEditing(null)}
                              onSubmit={async (v) => { await api.todos.update(todo.id, v); await saved(); }}
                            />
                          ) : (
                            <>
                              <span className={`status status-${todo.status}`}>{STATUS_LABEL[todo.status]}</span>
                              <span className="todo-title">{todo.title}</span>
                              <small className="muted">{todo.date}</small>
                              <span className="row-actions">
                                <button type="button" onClick={() => setEditing({ type: "todo", id: todo.id })}>수정</button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => deletion.open({ type: "todo", id: todo.id, title: todo.title })}
                                >
                                  삭제
                                </button>
                              </span>
                            </>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </article>
        ))}
      </section>

      {deletion.target && (
        <ConfirmDeleteDialog
          target={deletion.target}
          descendants={deletion.descendants}
          onConfirm={deletion.confirm}
          onCancel={deletion.cancel}
        />
      )}
    </div>
  );
}
