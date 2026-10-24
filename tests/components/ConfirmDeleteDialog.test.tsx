// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

afterEach(cleanup);

const deleteButton = () => screen.getByRole("button", { name: "삭제" }) as HTMLButtonElement;

describe("ConfirmDeleteDialog", () => {
  it("tells how many descendants go to the trash and cancel never confirms", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDeleteDialog
        target={{ type: "weeklyPlan", id: "p1", title: "이번 주 계획" }}
        descendants={{ todos: 3 }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByTestId("descendant-info").textContent).toBe("하위 할 일 3개도 함께 휴지통으로 이동합니다.");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("enables goal deletion only when the exact goal title is typed", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteDialog
        target={{ type: "goal", id: "g1", title: "책 24권 읽기" }}
        descendants={{ weeklyPlans: 2, todos: 5 }}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("descendant-info").textContent).toContain("하위 주간계획 2개와 할 일 5개");
    expect(deleteButton().disabled).toBe(true);

    const input = screen.getByLabelText("목표 제목 확인");
    await userEvent.type(input, "책 24권");
    expect(deleteButton().disabled).toBe(true);
    await userEvent.type(input, " 읽기 ");
    expect(deleteButton().disabled).toBe(true); // trailing space: not exact

    await userEvent.clear(input);
    await userEvent.type(input, "책 24권 읽기");
    expect(deleteButton().disabled).toBe(false);
    await userEvent.click(deleteButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the delete button disabled while descendant counts are loading", () => {
    render(
      <ConfirmDeleteDialog
        target={{ type: "todo", id: "t1", title: "30쪽 읽기" }}
        descendants={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(deleteButton().disabled).toBe(true);
    expect(screen.getByText("하위 항목을 확인하는 중…")).toBeTruthy();
  });
});
