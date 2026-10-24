import { describe, expect, it } from "vitest";
import { progress, progressSummary } from "@/lib/domain/progress";

describe("progress(done, total)", () => {
  it("is 0 when there are no todos", () => {
    expect(progress(0, 0)).toBe(0);
  });
  it("is 0 with one todo not done", () => {
    expect(progress(0, 1)).toBe(0);
  });
  it("is 25 with 1 of 4 done", () => {
    expect(progress(1, 4)).toBe(25);
  });
  it("is 100 when all are done", () => {
    expect(progress(1, 1)).toBe(100);
    expect(progress(4, 4)).toBe(100);
  });
  it("rounds to the nearest integer", () => {
    expect(progress(1, 3)).toBe(33);
    expect(progress(2, 3)).toBe(67);
  });
  it("progressSummary bundles done/total/percent", () => {
    expect(progressSummary(1, 4)).toEqual({ done: 1, total: 4, percent: 25 });
  });
});
