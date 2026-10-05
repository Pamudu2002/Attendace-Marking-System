/** Pure attendance maths shared by the backend analytics and the apps. See docs/PLAN.md §7. */

export function attendancePct(attended: number, counted: number): number | null {
  if (counted <= 0) return null;
  return Math.round((1000 * attended) / counted) / 10;
}

/** Best % a student can still reach if they attend every remaining session. */
export function maxAchievablePct(attended: number, counted: number, remaining: number): number | null {
  return attendancePct(attended + remaining, counted + remaining);
}

/**
 * Smallest k ≤ remaining such that (attended + k) / (counted + k) ≥ threshold/100.
 * Returns 0 when already at/above the threshold and null when it is no longer reachable.
 */
export function sessionsNeeded(
  attended: number,
  counted: number,
  remaining: number,
  thresholdPct: number,
): number | null {
  const t = thresholdPct / 100;
  if (counted === 0 || attended / counted >= t) return 0;
  // (a + k) / (c + k) >= t  <=>  k >= (t*c - a) / (1 - t)
  if (t >= 1) return attended === counted ? 0 : null;
  const k = Math.ceil((t * counted - attended) / (1 - t) - 1e-9);
  return k <= remaining ? Math.max(k, 0) : null;
}

export interface SessionWindow {
  startsAt: Date;
  endsAt: Date;
  checkInOpensBeforeMin: number;
  lateAfterMin: number;
}

export type WindowVerdict = "OUTSIDE_WINDOW" | "PRESENT" | "LATE";

/** Decide PRESENT/LATE/OUTSIDE_WINDOW for a tap at `at` (host clock). */
export function checkInVerdict(w: SessionWindow, at: Date): WindowVerdict {
  const opens = w.startsAt.getTime() - w.checkInOpensBeforeMin * 60_000;
  if (at.getTime() < opens || at.getTime() > w.endsAt.getTime()) return "OUTSIDE_WINDOW";
  return at.getTime() > w.startsAt.getTime() + w.lateAfterMin * 60_000 ? "LATE" : "PRESENT";
}
