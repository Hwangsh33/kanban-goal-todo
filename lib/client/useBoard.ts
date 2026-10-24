"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { orderBetween } from "@/lib/domain/order";
import type { TodoStatus } from "@/lib/domain/status";
import { api, type BoardData, type TodoDto } from "./api";

export type Columns = Record<TodoStatus, TodoDto[]>;

function toColumns(todos: TodoDto[]): Columns {
  const columns = { todo: [], doing: [], done: [] } as Columns;
  for (const t of [...todos].sort((a, b) => a.order - b.order)) columns[t.status].push(t);
  return columns;
}

/**
 * Board state for one week with optimistic drag & drop moves.
 *
 * Each move sends a per-card `seq` that starts from the card's server `lastSeq` and increases with
 * every request. A failed request rolls the card back (only if no newer move of that card was made
 * meanwhile) and raises a toast; a stale move (`applied: false`) resets the card to the server's
 * state. After a settled move the card's weekly plan progress is re-fetched; when the server
 * renumbered the column the whole board is reloaded instead of replacing only the moved card.
 */
export function useBoard(initialWeek: string) {
  const [week, setWeekState] = useState(initialWeek);
  const [weeklyPlanId, setWeeklyPlanId] = useState("");
  const [day, setDay] = useState("");
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  // Source of truth for event handlers; always updated together with `data`.
  const dataRef = useRef<BoardData | null>(null);
  const seqs = useRef(new Map<string, number>());

  const update = useCallback((fn: (d: BoardData) => BoardData) => {
    if (!dataRef.current) return;
    dataRef.current = fn(dataRef.current);
    setData(dataRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.board({ week, weeklyPlanId, day }).then(
      (board) => {
        if (cancelled) return;
        dataRef.current = board;
        setData(board);
        setError(null);
      },
      (err: Error) => {
        if (!cancelled) setError(err.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [week, weeklyPlanId, day, reloads]);

  const setWeek = useCallback((next: string) => {
    setWeekState(next);
    // Plans belong to one week, so a plan filter never carries over.
    setWeeklyPlanId("");
  }, []);

  const replaceTodo = useCallback(
    (todo: TodoDto) => update((d) => ({ ...d, todos: d.todos.map((t) => (t.id === todo.id ? todo : t)) })),
    [update],
  );

  const refreshProgress = useCallback(
    async (planId: string) => {
      try {
        const progress = await api.plans.progress(planId);
        update((d) => ({ ...d, plans: d.plans.map((p) => (p.id === planId ? { ...p, progress } : p)) }));
      } catch {
        // Progress stays as it was; the next board load corrects it.
      }
    },
    [update],
  );

  /** Moves a card to `status` at `index` of that column (index counted without the moved card). */
  const moveCard = useCallback(
    async (id: string, status: TodoStatus, index: number) => {
      const board = dataRef.current;
      const card = board?.todos.find((t) => t.id === id);
      if (!board || !card) return;

      const column = toColumns(board.todos)[status].filter((t) => t.id !== id);
      const at = Math.max(0, Math.min(index, column.length));
      const before = column[at - 1] ?? null;
      const after = column[at] ?? null;
      if (card.status === status) {
        const own = toColumns(board.todos)[status];
        const pos = own.findIndex((t) => t.id === id);
        if (pos === at) return; // dropped where it already was
      }

      const seq = Math.max(seqs.current.get(id) ?? 0, card.lastSeq) + 1;
      seqs.current.set(id, seq);
      replaceTodo({ ...card, status, order: orderBetween(before?.order, after?.order) });

      try {
        const res = await api.todos.move(id, { status, beforeId: before?.id ?? null, afterId: after?.id ?? null, seq });
        const latest = seqs.current.get(id) === seq;
        seqs.current.set(id, Math.max(seqs.current.get(id) ?? 0, res.todo.lastSeq));
        if (latest && res.renumbered) setReloads((n) => n + 1);
        else if (latest) replaceTodo(res.todo);
        await refreshProgress(card.weeklyPlanId);
      } catch (err) {
        if (seqs.current.get(id) === seq) {
          replaceTodo(card);
          setToast(`이동에 실패해 되돌렸습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
        }
      }
    },
    [replaceTodo, refreshProgress],
  );

  return {
    week,
    setWeek,
    weeklyPlanId,
    setWeeklyPlanId,
    day,
    setDay,
    data,
    columns: data ? toColumns(data.todos) : null,
    error,
    toast,
    dismissToast: useCallback(() => setToast(null), []),
    moveCard,
  };
}
