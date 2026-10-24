"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, TYPE_LABEL, type ParentRef, type TrashItem } from "@/lib/client/api";

function descendantSummary(item: TrashItem): string {
  const parts: string[] = [];
  if (item.descendants.weeklyPlans) parts.push(`주간계획 ${item.descendants.weeklyPlans}개`);
  if (item.descendants.todos) parts.push(`할 일 ${item.descendants.todos}개`);
  return parts.length ? `하위 ${parts.join(", ")} 포함` : "";
}

/** Trash: restore (refused with guidance while a parent is deleted) or delete permanently. */
export function TrashView() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await api.trash.list());
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "불러오지 못했습니다" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.trash.list().then(
      (list) => !cancelled && setItems(list),
      (err: Error) => !cancelled && setNotice({ kind: "error", text: err.message }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function parentText(parent: ParentRef): string {
    const found = items?.find((i) => i.type === parent.type && i.id === parent.id);
    return `${TYPE_LABEL[parent.type]}${found ? ` ‘${found.title}’` : ""}`;
  }

  async function restore(item: TrashItem) {
    try {
      await api.trash.restore(item.type, item.id);
      setNotice({ kind: "info", text: `‘${item.title}’을(를) 복원했습니다.` });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const parent = err.body.parent as ParentRef | undefined;
        setNotice({
          kind: "error",
          text: `${err.message}${parent ? ` (삭제된 상위 항목: ${parentText(parent)})` : ""}`,
        });
        return;
      }
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "복원에 실패했습니다" });
    }
    await reload();
  }

  async function purge(item: TrashItem) {
    setConfirmPurge(null);
    try {
      await api.trash.purge(item.type, item.id);
      setNotice({ kind: "info", text: `‘${item.title}’을(를) 영구 삭제했습니다.` });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "영구 삭제에 실패했습니다" });
    }
    await reload();
  }

  if (!items) return <p className="muted">불러오는 중…</p>;

  return (
    <div>
      <p className="muted">삭제한 항목은 30일 동안 보관된 뒤 자동으로 영구 삭제됩니다.</p>
      {notice && (
        <p className={notice.kind === "error" ? "banner" : "banner info"} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      {items.length === 0 ? (
        <p className="muted">휴지통이 비어 있습니다.</p>
      ) : (
        <ul className="trash-list">
          {items.map((item) => {
            const key = `${item.type}:${item.id}`;
            return (
              <li key={key} className="trash-item" data-testid={`trash-${item.id}`}>
                <div>
                  <span className="badge">{TYPE_LABEL[item.type]}</span> <strong>{item.title}</strong>
                  <div className="muted small">
                    {new Date(item.deletedAt).toLocaleString("ko-KR")} 삭제 {descendantSummary(item)}
                    {item.deletedParent && ` · 상위 ${parentText(item.deletedParent)}도 삭제됨`}
                  </div>
                </div>
                <div className="row-actions">
                  {confirmPurge === key ? (
                    <>
                      <span className="small">되돌릴 수 없습니다.</span>
                      <button type="button" onClick={() => setConfirmPurge(null)}>취소</button>
                      <button type="button" className="danger" onClick={() => purge(item)}>영구 삭제 확인</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="primary" onClick={() => restore(item)}>복원</button>
                      <button type="button" className="danger" onClick={() => setConfirmPurge(key)}>영구 삭제</button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
