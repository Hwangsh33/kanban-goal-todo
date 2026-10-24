/** A week belongs to the year of its Monday; a WeeklyPlan may only link to a Goal of that year. */
export function weekStartYear(weekStartDate: string): number {
  return Number(weekStartDate.slice(0, 4));
}

export function isWeekStartInGoalYear(weekStartDate: string, goalYear: number): boolean {
  return weekStartYear(weekStartDate) === goalYear;
}
