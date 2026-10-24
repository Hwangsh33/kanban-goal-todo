/**
 * Week/date rules. Dates are calendar strings "YYYY-MM-DD"; a week runs Monday..Sunday and is
 * identified by its Monday (weekStart). "Today" is computed in APP_TIMEZONE (default Asia/Seoul),
 * so a UTC server agrees with the user's local calendar.
 */

export const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_TIMEZONE = "Asia/Seoul";

// Validated APP_TIMEZONE values -> zone actually used (an invalid one maps to the default).
const checkedZones = new Map<string, string>();

/** APP_TIMEZONE, or Asia/Seoul when unset or invalid (warned once per invalid value). */
export function appTimeZone(): string {
  const zone = process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
  let resolved = checkedZones.get(zone);
  if (resolved === undefined) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: zone });
      resolved = zone;
    } catch {
      console.warn(`APP_TIMEZONE "${zone}" is not a valid time zone; using ${DEFAULT_TIMEZONE}`);
      resolved = DEFAULT_TIMEZONE;
    }
    checkedZones.set(zone, resolved);
  }
  return resolved;
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDateString(value: string): boolean {
  return DATE_RE.test(value) && fromUtcMs(toUtcMs(value)) === value;
}

/** Calendar date of `now` in the given time zone. */
export function today(now: Date = new Date(), timeZone: string = appTimeZone()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export const shiftDate = addDays;

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(toUtcMs(date)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `date` (defaults to today in APP_TIMEZONE). */
export function weekStart(date: string = today()): string {
  return addDays(date, -weekdayIndex(date));
}

export function weekEnd(weekStartDate: string): string {
  return addDays(weekStartDate, 6);
}

export function isMonday(date: string): boolean {
  return weekdayIndex(date) === 0;
}

export function isInWeek(date: string, weekStartDate: string): boolean {
  const offset = diffDays(weekStartDate, date);
  return offset >= 0 && offset <= 6;
}

/** Default todo date: today if it falls in the plan's week, otherwise the plan's Monday. */
export function defaultTodoDate(weekStartDate: string, todayDate: string = today()): string {
  return isInWeek(todayDate, weekStartDate) ? todayDate : weekStartDate;
}

/** Moves a date from one week to another keeping its weekday. */
export function shiftDateToWeek(date: string, fromWeekStart: string, toWeekStart: string): string {
  return addDays(date, diffDays(fromWeekStart, toWeekStart));
}
