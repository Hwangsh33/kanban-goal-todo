"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { GoalDto, WeeklyPlanDto } from "@/lib/client/api";

/** Create/edit forms. Required fields are checked before submitting; server errors are shown too. */

type FieldErrors = Record<string, string>;

function useSubmitState() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(fieldErrors: FieldErrors, action: () => Promise<void>) {
    setErrors(fieldErrors);
    setFormError(null);
    if (Object.keys(fieldErrors).length > 0) return;
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "저장에 실패했습니다");
    } finally {
      setBusy(false);
    }
  }
  return { errors, formError, busy, submit };
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      {/* The error stays outside the label so it does not become part of the control's name. */}
      <label className="field">
        <span>{label}</span>
        {children}
      </label>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function FormShell(props: {
  name: string;
  busy: boolean;
  formError: string | null;
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="form"
      aria-label={props.name}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      {props.children}
      {props.formError && (
        <p className="form-error" role="alert">
          {props.formError}
        </p>
      )}
      <div className="actions">
        {props.onCancel && (
          <button type="button" onClick={props.onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="primary" disabled={props.busy}>
          {props.submitLabel}
        </button>
      </div>
    </form>
  );
}

const TITLE_REQUIRED = "제목을 입력하세요";

export type GoalValues = { title: string; year: number };

export function GoalForm(props: {
  initial?: GoalValues;
  defaultYear: number;
  onSubmit: (values: GoalValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(props.initial?.title ?? "");
  const [year, setYear] = useState(String(props.initial?.year ?? props.defaultYear));
  const { errors, formError, busy, submit } = useSubmitState();

  return (
    <FormShell
      name={props.initial ? "1년 목표 수정" : "1년 목표 추가"}
      busy={busy}
      formError={formError}
      submitLabel={props.initial ? "저장" : "목표 추가"}
      onCancel={props.onCancel}
      onSubmit={() => {
        const e: FieldErrors = {};
        if (!title.trim()) e.title = TITLE_REQUIRED;
        if (!/^\d{4}$/.test(year)) e.year = "연도를 4자리 숫자로 입력하세요";
        return submit(e, async () => {
          await props.onSubmit({ title: title.trim(), year: Number(year) });
          if (!props.initial) setTitle("");
        });
      }}
    >
      <Field label="목표 제목" error={errors.title}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 책 24권 읽기" />
      </Field>
      <Field label="연도" error={errors.year}>
        <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
      </Field>
    </FormShell>
  );
}

export type PlanValues = { title: string; weekStart: string; goalId: string };

export function WeeklyPlanForm(props: {
  goals: GoalDto[];
  initial?: PlanValues;
  defaultWeekStart: string;
  onSubmit: (values: PlanValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(props.initial?.title ?? "");
  const [weekStart, setWeekStart] = useState(props.initial?.weekStart ?? props.defaultWeekStart);
  const [goalId, setGoalId] = useState(props.initial?.goalId ?? "");
  const { errors, formError, busy, submit } = useSubmitState();

  return (
    <FormShell
      name={props.initial ? "주간계획 수정" : "주간계획 추가"}
      busy={busy}
      formError={formError}
      submitLabel={props.initial ? "저장" : "주간계획 추가"}
      onCancel={props.onCancel}
      onSubmit={() => {
        const e: FieldErrors = {};
        if (!title.trim()) e.title = TITLE_REQUIRED;
        if (!weekStart) e.weekStart = "주 시작일(월요일)을 입력하세요";
        if (!goalId) e.goalId = "1년 목표를 선택하세요";
        return submit(e, async () => {
          await props.onSubmit({ title: title.trim(), weekStart, goalId });
          if (!props.initial) setTitle("");
        });
      }}
    >
      <Field label="주간계획 제목" error={errors.title}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 이번 주 2권 읽기" />
      </Field>
      <Field label="주 시작일(월요일)" error={errors.weekStart}>
        <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
      </Field>
      <Field label="1년 목표" error={errors.goalId}>
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">목표 선택</option>
          {props.goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} ({g.year})
            </option>
          ))}
        </select>
      </Field>
    </FormShell>
  );
}

export type TodoValues = { title: string; weeklyPlanId: string; date?: string };

export function TodoForm(props: {
  plans: WeeklyPlanDto[];
  initial?: TodoValues;
  onSubmit: (values: TodoValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(props.initial?.title ?? "");
  const [weeklyPlanId, setWeeklyPlanId] = useState(props.initial?.weeklyPlanId ?? "");
  const [date, setDate] = useState(props.initial?.date ?? "");
  const { errors, formError, busy, submit } = useSubmitState();

  return (
    <FormShell
      name={props.initial ? "할 일 수정" : "할 일 추가"}
      busy={busy}
      formError={formError}
      submitLabel={props.initial ? "저장" : "할 일 추가"}
      onCancel={props.onCancel}
      onSubmit={() => {
        const e: FieldErrors = {};
        if (!title.trim()) e.title = TITLE_REQUIRED;
        if (!weeklyPlanId) e.weeklyPlanId = "주간계획을 선택하세요";
        return submit(e, async () => {
          const values: TodoValues = { title: title.trim(), weeklyPlanId };
          // When the plan changes without an explicit new date the server keeps the weekday.
          if (date && !(props.initial && weeklyPlanId !== props.initial.weeklyPlanId && date === props.initial.date)) {
            values.date = date;
          }
          await props.onSubmit(values);
          if (!props.initial) {
            setTitle("");
            setDate("");
          }
        });
      }}
    >
      <Field label="할 일 제목" error={errors.title}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 30쪽 읽기" />
      </Field>
      <Field label="주간계획" error={errors.weeklyPlanId}>
        <select value={weeklyPlanId} onChange={(e) => setWeeklyPlanId(e.target.value)}>
          <option value="">주간계획 선택</option>
          {props.plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.weekStart} 주)
            </option>
          ))}
        </select>
      </Field>
      <Field label="날짜 (비우면 자동)">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </FormShell>
  );
}
