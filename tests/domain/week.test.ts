import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  appTimeZone,
  defaultTodoDate,
  diffDays,
  isDateString,
  isInWeek,
  isMonday,
  shiftDate,
  shiftDateToWeek,
  today,
  weekdayIndex,
  weekEnd,
  weekStart,
} from "@/lib/domain/week";

describe("isDateString", () => {
  it("accepts real calendar dates only", () => {
    expect(isDateString("2026-02-28")).toBe(true);
    expect(isDateString("2024-02-29")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-1-01")).toBe(false);
    expect(isDateString("not-a-date")).toBe(false);
  });
});

describe("weekStart (Monday)", () => {
  it("returns the same day for a Monday", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
  it("maps Sunday to the previous Monday (week is Mon..Sun)", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
  });
  it("crosses year end: 2027-01-01 (Fri) belongs to week of 2026-12-28", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
    expect(weekStart("2027-01-04")).toBe("2027-01-04");
  });
  it("crosses month and leap day", () => {
    expect(weekStart("2024-03-01")).toBe("2024-02-26");
  });
  it("defaults to the week of 'today' in APP_TIMEZONE", () => {
    const expected = weekStart(today());
    expect(weekStart()).toBe(expected);
  });
});

describe("today (APP_TIMEZONE)", () => {
  const saved = process.env.APP_TIMEZONE;
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = saved;
  });

  it("computes the KST date even when the instant is still the previous day in UTC", () => {
    // 2026-01-04T15:30Z (Sunday in UTC) is Monday 00:30 in Seoul.
    const now = new Date("2026-01-04T15:30:00Z");
    expect(today(now, "Asia/Seoul")).toBe("2026-01-05");
    expect(today(now, "UTC")).toBe("2026-01-04");
    expect(weekStart(today(now, "Asia/Seoul"))).toBe("2026-01-05");
    expect(weekStart(today(now, "UTC"))).toBe("2025-12-29");
  });

  it("defaults to Asia/Seoul when APP_TIMEZONE is unset", () => {
    delete process.env.APP_TIMEZONE;
    expect(today(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });

  it("uses APP_TIMEZONE when set", () => {
    process.env.APP_TIMEZONE = "UTC";
    expect(today(new Date("2026-12-31T15:00:00Z"))).toBe("2026-12-31");
  });

  it("falls back to Asia/Seoul for an invalid APP_TIMEZONE and warns only once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      process.env.APP_TIMEZONE = "Not/AZone";
      expect(appTimeZone()).toBe("Asia/Seoul");
      expect(today(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
      expect(weekStart()).toBe(weekStart(today(new Date(), "Asia/Seoul")));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("Not/AZone");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("week range", () => {
  it("weekEnd is weekStart + 6 days", () => {
    expect(weekEnd("2026-12-28")).toBe("2027-01-03");
  });
  it("isInWeek includes Monday..Sunday and excludes neighbours", () => {
    expect(isInWeek("2026-12-28", "2026-12-28")).toBe(true);
    expect(isInWeek("2027-01-03", "2026-12-28")).toBe(true);
    expect(isInWeek("2026-12-27", "2026-12-28")).toBe(false);
    expect(isInWeek("2027-01-04", "2026-12-28")).toBe(false);
  });
  it("isMonday", () => {
    expect(isMonday("2026-10-19")).toBe(true);
    expect(isMonday("2026-10-25")).toBe(false);
  });
  it("weekdayIndex is 0 for Monday and 6 for Sunday", () => {
    expect(weekdayIndex("2026-10-19")).toBe(0);
    expect(weekdayIndex("2026-10-25")).toBe(6);
  });
});

describe("defaultTodoDate", () => {
  it("is today when today is inside the plan's week", () => {
    expect(defaultTodoDate("2026-10-19", "2026-10-22")).toBe("2026-10-22");
    expect(defaultTodoDate("2026-10-19", "2026-10-25")).toBe("2026-10-25");
  });
  it("is weekStart when today is outside the plan's week (future or past)", () => {
    expect(defaultTodoDate("2026-10-26", "2026-10-22")).toBe("2026-10-26");
    expect(defaultTodoDate("2026-10-12", "2026-10-22")).toBe("2026-10-12");
  });
});

describe("date shifting", () => {
  it("addDays / shiftDate move by whole days across year end", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(shiftDate("2027-01-02", -3)).toBe("2026-12-30");
  });
  it("diffDays counts days between two dates", () => {
    expect(diffDays("2026-12-28", "2027-01-04")).toBe(7);
    expect(diffDays("2027-01-04", "2026-12-28")).toBe(-7);
  });
  it("shiftDateToWeek keeps the weekday when moving to another week", () => {
    // Thursday in week of 2026-10-19 -> Thursday in week of 2026-12-28
    const moved = shiftDateToWeek("2026-10-22", "2026-10-19", "2026-12-28");
    expect(moved).toBe("2026-12-31");
    expect(weekdayIndex(moved)).toBe(weekdayIndex("2026-10-22"));
    expect(shiftDateToWeek("2026-10-25", "2026-10-19", "2026-10-12")).toBe("2026-10-18");
  });
});
