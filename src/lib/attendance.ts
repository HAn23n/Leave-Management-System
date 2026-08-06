/** Worked hours for a finished (or in-progress) day: raw duration minus the flat break deduction, floored at 0. */
export function computeWorkedHours(checkInAt: string, checkOutAt: string, breakHours: number): number {
  const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  const rawHours = ms / (1000 * 60 * 60);
  return Math.max(0, rawHours - breakHours);
}
