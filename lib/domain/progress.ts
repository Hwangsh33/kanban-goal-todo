export type Progress = { done: number; total: number; percent: number };

/** Percentage of done todos, rounded; 0 when there are no todos. */
export function progress(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function progressSummary(done: number, total: number): Progress {
  return { done, total, percent: progress(done, total) };
}
