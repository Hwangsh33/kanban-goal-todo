// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalForm, TodoForm, WeeklyPlanForm } from "@/components/Forms";
import type { WeeklyPlanDto } from "@/lib/client/api";

afterEach(cleanup);

const plans: WeeklyPlanDto[] = [
  { id: "p1", title: "독서 주간", weekStart: "2030-03-04", goalId: "g1", deletedAt: null },
];

describe("TodoForm", () => {
  it("shows required errors for an empty title and a missing weekly plan and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<TodoForm plans={plans} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "할 일 추가" }));

    const errors = screen.getAllByRole("alert").map((e) => e.textContent);
    expect(errors).toEqual(["제목을 입력하세요", "주간계획을 선택하세요"]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only title as empty", async () => {
    const onSubmit = vi.fn();
    render(<TodoForm plans={plans} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("할 일 제목"), "   ");
    await userEvent.selectOptions(screen.getByLabelText("주간계획"), "p1");
    await userEvent.click(screen.getByRole("button", { name: "할 일 추가" }));
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual(["제목을 입력하세요"]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values and shows a server error message", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("날짜는 주간계획의 주 범위 안이어야 합니다"));
    render(<TodoForm plans={plans} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("할 일 제목"), "  30쪽 읽기 ");
    await userEvent.selectOptions(screen.getByLabelText("주간계획"), "p1");
    await userEvent.click(screen.getByRole("button", { name: "할 일 추가" }));

    expect(onSubmit).toHaveBeenCalledWith({ title: "30쪽 읽기", weeklyPlanId: "p1" });
    expect((await screen.findByRole("alert")).textContent).toBe("날짜는 주간계획의 주 범위 안이어야 합니다");
  });
});

describe("GoalForm / WeeklyPlanForm", () => {
  it("requires a goal title", async () => {
    const onSubmit = vi.fn();
    render(<GoalForm defaultYear={2030} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "목표 추가" }));
    expect(screen.getByRole("alert").textContent).toBe("제목을 입력하세요");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a title and a goal for a weekly plan, then submits", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const goals = [{ id: "g1", title: "독서", year: 2030, deletedAt: null }];
    render(<WeeklyPlanForm goals={goals} defaultWeekStart="2030-03-04" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "주간계획 추가" }));
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual(["제목을 입력하세요", "1년 목표를 선택하세요"]);

    await userEvent.type(screen.getByLabelText("주간계획 제목"), "독서 주간");
    await userEvent.selectOptions(screen.getByLabelText("1년 목표"), "g1");
    await userEvent.click(screen.getByRole("button", { name: "주간계획 추가" }));
    expect(onSubmit).toHaveBeenCalledWith({ title: "독서 주간", weekStart: "2030-03-04", goalId: "g1" });
  });
});
