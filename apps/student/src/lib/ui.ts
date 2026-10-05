import type { Tone } from "@attendance/mobile-core";

/** Green at/above the threshold, amber within 10 points, red below that. */
export function pctTone(pct: number | null, threshold: number): Tone {
  if (pct === null) return "neutral";
  if (pct >= threshold) return "good";
  return pct >= threshold - 10 ? "warn" : "bad";
}
