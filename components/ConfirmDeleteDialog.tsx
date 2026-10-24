"use client";

import { useState } from "react";
import { TYPE_LABEL, type Descendants, type ItemType } from "@/lib/client/api";

export type DeleteTarget = { type: ItemType; id: string; title: string };

type Props = {
  target: DeleteTarget;
  /** null while the descendant counts are loading. */
  descendants: Descendants | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

function descendantText(type: ItemType, d: Descendants): string {
  if (type === "goal") return `하위 주간계획 ${d.weeklyPlans ?? 0}개와 할 일 ${d.todos ?? 0}개도 함께 휴지통으로 이동합니다.`;
  if (type === "weeklyPlan") return `하위 할 일 ${d.todos ?? 0}개도 함께 휴지통으로 이동합니다.`;
  return "";
}

/**
 * Delete confirmation. Explains how many descendants go to the trash with the item; deleting a
 * goal additionally requires typing its exact title. Cancel closes without any change.
 */
export function ConfirmDeleteDialog({ target, descendants, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const needsTitle = target.type === "goal";
  const canConfirm = descendants !== null && !busy && (!needsTitle || typed === target.title);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
        <h2 id="delete-dialog-title">{TYPE_LABEL[target.type]} 삭제</h2>
        <p>
          <strong>‘{target.title}’</strong>을(를) 삭제할까요?
        </p>
        {descendants === null ? (
          <p className="muted">하위 항목을 확인하는 중…</p>
        ) : (
          target.type !== "todo" && <p data-testid="descendant-info">{descendantText(target.type, descendants)}</p>
        )}
        <p className="muted">삭제한 항목은 휴지통에서 30일 동안 복원할 수 있습니다.</p>
        {needsTitle && (
          <label className="field">
            <span>확인을 위해 목표 제목을 정확히 입력하세요</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="목표 제목 확인" autoFocus />
          </label>
        )}
        <div className="actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="danger" disabled={!canConfirm} onClick={confirm}>
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
