const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const fmtDay = (iso: string | Date) => dayFmt.format(new Date(iso));
export const fmtRange = (start: string, end: string) => `${fmtDay(start)} · ${fmtTime(start)}–${fmtTime(end)}`;
export const fmtPct = (pct: number | null | undefined) => (pct === null || pct === undefined ? "–" : `${pct.toFixed(pct % 1 ? 1 : 0)}%`);

/** "in 25 min", "in 3 h", "now", "2 h ago" */
export function relative(iso: string, now = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(diffMin);
  const unit = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  if (abs < 1) return "now";
  return diffMin > 0 ? `in ${unit}` : `${unit} ago`;
}

/** Local YYYY-MM-DD (calendar keys). */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
