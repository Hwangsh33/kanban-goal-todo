"use client";

import { useState } from "react";
import { api, type Descendants } from "@/lib/client/api";
import type { DeleteTarget } from "./ConfirmDeleteDialog";

/** Open → load descendant counts → confirm (DELETE) or cancel (no request). */
export function useDeleteFlow(onDeleted: () => void | Promise<void>, onError: (message: string) => void) {
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [descendants, setDescendants] = useState<Descendants | null>(null);

  function open(next: DeleteTarget) {
    setTarget(next);
    setDescendants(null);
    api.descendants(next.type, next.id).then(setDescendants, (err: Error) => {
      setTarget(null);
      onError(err.message);
    });
  }

  async function confirm() {
    if (!target) return;
    try {
      await api.remove(target.type, target.id);
      setTarget(null);
      await onDeleted();
    } catch (err) {
      setTarget(null);
      onError(err instanceof Error ? err.message : "삭제에 실패했습니다");
    }
  }

  return { target, descendants, open, confirm, cancel: () => setTarget(null) };
}
