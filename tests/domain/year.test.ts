import { describe, expect, it } from "vitest";
import { isWeekStartInGoalYear, weekStartYear } from "@/lib/domain/year";

describe("year rule: weekStart year must equal Goal.year", () => {
  it("weekStartYear takes the year of the Monday", () => {
    expect(weekStartYear("2026-12-28")).toBe(2026);
  });
  it("accepts a plan whose Monday is in the goal year", () => {
    expect(isWeekStartInGoalYear("2026-10-19", 2026)).toBe(true);
  });
  it("a week spanning New Year belongs to the year of its Monday", () => {
    expect(isWeekStartInGoalYear("2026-12-28", 2026)).toBe(true);
    expect(isWeekStartInGoalYear("2026-12-28", 2027)).toBe(false);
  });
  it("rejects a different year", () => {
    expect(isWeekStartInGoalYear("2027-01-04", 2026)).toBe(false);
  });
});
