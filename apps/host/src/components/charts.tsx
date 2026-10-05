/**
 * Small SVG chart kit for the Insights screens (react-native-svg).
 * Follows the dataviz method: single blue series for magnitude, the fixed status palette for
 * present/late/excused/absent (always with a text label, never colour alone), thin marks with
 * 4px rounded data-ends, 2px surface gaps, recessive hairline grid, tap-to-inspect tooltips.
 */
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, useColorScheme, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { AttendanceRowStatus } from "@attendance/shared";
import { spacing, usePalette } from "@attendance/mobile-core";

export function useChartTheme() {
  const dark = useColorScheme() === "dark";
  const p = usePalette();
  return {
    surface: p.card,
    grid: p.border,
    text: p.text,
    muted: p.muted,
    series: dark ? "#3987e5" : "#2a78d6",
    seriesWash: dark ? "rgba(57,135,229,0.12)" : "rgba(42,120,214,0.10)",
    status: {
      PRESENT: "#0ca30c",
      LATE: "#fab219",
      EXCUSED: dark ? "#6b6f7a" : "#a3a6ae",
      ABSENT: "#d03b3b",
    } as Record<AttendanceRowStatus, string>,
    // Ink chosen per fill luminance so labels inside cells always clear contrast.
    statusInk: { PRESENT: "#ffffff", LATE: "#1a1a19", EXCUSED: "#ffffff", ABSENT: "#ffffff" } as Record<AttendanceRowStatus, string>,
  };
}

export const STATUS_LETTER: Record<AttendanceRowStatus, string> = { PRESENT: "P", LATE: "L", EXCUSED: "E", ABSENT: "A" };
const BAR = 14; // bar thickness (≤ 24px)
const R = 4; // rounded data-end radius

function useWidth(initial = 300): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(120, e.nativeEvent.layout.width))];
}

/** Horizontal bar with a rounded data-end and a square baseline. */
function hBarPath(x: number, y: number, w: number, h: number) {
  if (w <= 0) return "";
  const r = Math.min(R, w, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

/** Column with rounded top and a square baseline at `base`. */
function colPath(x: number, base: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(R, w / 2, h);
  const top = base - h;
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

export function Tooltip({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.neutralBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" }}>
      <Text style={{ color: p.text, fontSize: 13 }}>{children}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

export interface PctRow {
  key: string;
  label: string;
  sub?: string;
  value: number | null;
}

/**
 * Per-student attendance: one bar per student (0–100%), a reference line at the threshold.
 * Bars under the threshold switch to the critical status colour AND get a "▼ below" label.
 */
export function PercentBars({ rows, threshold, onPress }: { rows: PctRow[]; threshold: number; onPress?: (key: string) => void }) {
  const t = useChartTheme();
  const [w, onLayout] = useWidth();
  const labelW = 46;
  const plotW = w - labelW;
  const x = (v: number) => (Math.max(0, Math.min(100, v)) / 100) * plotW;
  return (
    <View onLayout={onLayout} style={{ gap: spacing.sm }}>
      {rows.map((r) => {
        const below = r.value !== null && r.value < threshold;
        return (
          <Pressable key={r.key} onPress={onPress ? () => onPress(r.key) : undefined} style={{ gap: 2 }} hitSlop={4}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: t.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                {r.label}
              </Text>
              {r.sub ? <Text style={{ color: t.muted, fontSize: 12 }}>{r.sub}</Text> : null}
            </View>
            <Svg width={w} height={BAR + 4}>
              <Rect x={0} y={2} width={plotW} height={BAR} fill={t.grid} opacity={0.35} rx={R} />
              {r.value !== null ? (
                <Path d={hBarPath(0, 2, x(r.value), BAR)} fill={below ? t.status.ABSENT : t.series} />
              ) : null}
              <Line x1={x(threshold)} x2={x(threshold)} y1={0} y2={BAR + 4} stroke={t.text} strokeWidth={1.5} />
              <SvgText x={w} y={BAR - 1} fill={below ? t.status.ABSENT : t.text} fontSize={12} fontWeight="600" textAnchor="end">
                {r.value === null ? "–" : `${below ? "▼ " : ""}${Math.round(r.value)}%`}
              </SvgText>
            </Svg>
          </Pressable>
        );
      })}
      <Text style={{ color: t.muted, fontSize: 12 }}>Vertical line = {threshold}% requirement. ▼ = below requirement.</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

export interface LinePoint {
  label: string;
  sub?: string;
  value: number | null;
}

/** Attendance % per session over time, with the threshold as a reference line. Tap to inspect. */
export function TrendLine({ points, threshold, height = 180 }: { points: LinePoint[]; threshold: number; height?: number }) {
  const t = useChartTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const pad = { l: 34, r: 12, t: 10, b: 22 };
  const pw = w - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const n = points.length;
  const xAt = (i: number) => pad.l + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const yAt = (v: number) => pad.t + ph - (v / 100) * ph;
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null) as (LinePoint & { i: number; value: number })[];
  const d = valid.map((p, k) => `${k ? "L" : "M"}${xAt(p.i)},${yAt(p.value)}`).join(" ");
  const area = valid.length > 1 ? `${d} L${xAt(valid[valid.length - 1]!.i)},${yAt(0)} L${xAt(valid[0]!.i)},${yAt(0)} Z` : "";
  const last = valid[valid.length - 1];
  const s = sel !== null ? points[sel] : null;

  return (
    <View onLayout={onLayout} style={{ gap: spacing.xs }}>
      <View style={{ minHeight: 30 }}>
        {s ? (
          <Tooltip>
            {s.label}
            {s.sub ? ` · ${s.sub}` : ""}: {s.value === null ? "–" : `${s.value}%`}
          </Tooltip>
        ) : (
          <Text style={{ color: t.muted, fontSize: 12 }}>Tap the chart to inspect a session.</Text>
        )}
      </View>
      <Pressable
        onPress={(e) => {
          if (n === 0) return;
          const i = Math.round(((e.nativeEvent.locationX - pad.l) / Math.max(pw, 1)) * (n - 1));
          setSel(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        <Svg width={w} height={height}>
          {[0, 50, 100].map((v) => (
            <Line key={v} x1={pad.l} x2={w - pad.r} y1={yAt(v)} y2={yAt(v)} stroke={t.grid} strokeWidth={1} />
          ))}
          {[0, 50, 100].map((v) => (
            <SvgText key={`t${v}`} x={pad.l - 6} y={yAt(v) + 4} fill={t.muted} fontSize={11} textAnchor="end">
              {v}%
            </SvgText>
          ))}
          <Line x1={pad.l} x2={w - pad.r} y1={yAt(threshold)} y2={yAt(threshold)} stroke={t.text} strokeWidth={1} opacity={0.6} />
          <SvgText x={w - pad.r} y={yAt(threshold) - 4} fill={t.muted} fontSize={11} textAnchor="end">
            {threshold}% required
          </SvgText>
          {area ? <Path d={area} fill={t.seriesWash} /> : null}
          {d ? <Path d={d} stroke={t.series} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {sel !== null ? (
            <Line x1={xAt(sel)} x2={xAt(sel)} y1={pad.t} y2={pad.t + ph} stroke={t.muted} strokeWidth={1} />
          ) : null}
          {valid.map((p) => (
            <Circle
              key={p.i}
              cx={xAt(p.i)}
              cy={yAt(p.value)}
              r={sel === p.i || p === last ? 5 : 4}
              fill={t.series}
              stroke={t.surface}
              strokeWidth={2}
            />
          ))}
          {last ? (
            <SvgText x={Math.min(xAt(last.i), w - pad.r)} y={yAt(last.value) - 10} fill={t.text} fontSize={12} fontWeight="600" textAnchor="end">
              {Math.round(last.value)}%
            </SvgText>
          ) : null}
          {n > 0 ? (
            <>
              <SvgText x={xAt(0)} y={height - 6} fill={t.muted} fontSize={11} textAnchor="start">
                {points[0]!.label}
              </SvgText>
              {n > 1 ? (
                <SvgText x={xAt(n - 1)} y={height - 6} fill={t.muted} fontSize={11} textAnchor="end">
                  {points[n - 1]!.label}
                </SvgText>
              ) : null}
            </>
          ) : null}
        </Svg>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

export interface Column {
  label: string;
  value: number;
  tip?: string;
}

/** Column chart (histograms, weekday bars). 2px surface gap between touching columns. */
export function Columns({
  data,
  height = 150,
  unit = "",
  maxValue,
  everyNthLabel = 1,
}: {
  data: Column[];
  height?: number;
  unit?: string;
  maxValue?: number;
  everyNthLabel?: number;
}) {
  const t = useChartTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const pad = { l: 8, r: 8, t: 8, b: 20 };
  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));
  const slot = (w - pad.l - pad.r) / Math.max(1, data.length);
  const colW = Math.min(24, slot - 2);
  const base = height - pad.b;
  const ph = base - pad.t;
  const s = sel !== null ? data[sel] : null;
  return (
    <View onLayout={onLayout} style={{ gap: spacing.xs }}>
      <View style={{ minHeight: 30 }}>
        {s ? (
          <Tooltip>{s.tip ?? `${s.label}: ${s.value}${unit}`}</Tooltip>
        ) : (
          <Text style={{ color: t.muted, fontSize: 12 }}>Tap a column for details.</Text>
        )}
      </View>
      <Pressable
        onPress={(e) => {
          const i = Math.floor((e.nativeEvent.locationX - pad.l) / slot);
          if (i >= 0 && i < data.length) setSel(i);
        }}
      >
        <Svg width={w} height={height}>
          <Line x1={pad.l} x2={w - pad.r} y1={base} y2={base} stroke={t.grid} strokeWidth={1} />
          {data.map((d, i) => {
            const x = pad.l + i * slot + (slot - colW) / 2;
            const h = (d.value / max) * ph;
            return (
              <Path key={i} d={colPath(x, base, colW, h)} fill={t.series} opacity={sel === null || sel === i ? 1 : 0.45} />
            );
          })}
          {data.map((d, i) =>
            i % everyNthLabel === 0 ? (
              <SvgText key={`l${i}`} x={pad.l + i * slot + slot / 2} y={height - 5} fill={t.muted} fontSize={10} textAnchor="middle">
                {d.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

export function StatusLegend({ counts }: { counts?: Partial<Record<AttendanceRowStatus, number>> }) {
  const t = useChartTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
      {(Object.keys(STATUS_LETTER) as AttendanceRowStatus[]).map((k) => (
        <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: t.status[k], alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.statusInk[k], fontSize: 9, fontWeight: "700" }}>{STATUS_LETTER[k]}</Text>
          </View>
          <Text style={{ color: t.text, fontSize: 12 }}>
            {k.charAt(0) + k.slice(1).toLowerCase()}
            {counts?.[k] !== undefined ? ` ${counts[k]}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 100% stacked bar of the status split (instead of a donut), with a legend carrying the counts. */
export function StatusSplit({ split }: { split: Record<AttendanceRowStatus, number> }) {
  const t = useChartTheme();
  const [w, onLayout] = useWidth();
  const order: AttendanceRowStatus[] = ["PRESENT", "LATE", "EXCUSED", "ABSENT"];
  const total = order.reduce((n, k) => n + split[k], 0);
  let x = 0;
  const gap = 2;
  const visible = order.filter((k) => split[k] > 0);
  const usable = w - gap * Math.max(0, visible.length - 1);
  return (
    <View onLayout={onLayout} style={{ gap: spacing.sm }}>
      <Svg width={w} height={22}>
        {total === 0 ? <Rect x={0} y={0} width={w} height={22} rx={R} fill={t.grid} /> : null}
        {visible.map((k) => {
          const segW = (split[k] / total) * usable;
          const el = <Rect key={k} x={x} y={0} width={segW} height={22} fill={t.status[k]} rx={2} />;
          const label =
            segW > 34 ? (
              <SvgText key={`${k}t`} x={x + segW / 2} y={15} fontSize={11} fontWeight="700" fill={t.statusInk[k]} textAnchor="middle">
                {Math.round((split[k] / total) * 100)}%
              </SvgText>
            ) : null;
          x += segW + gap;
          return [el, label];
        })}
      </Svg>
      <StatusLegend counts={split} />
    </View>
  );
}

/** Student × session grid. Each cell carries a letter so status never relies on colour alone. */
export function StatusMatrix({
  rows,
  cols,
  cells,
}: {
  rows: { id: string; label: string }[];
  cols: { id: string; label: string }[];
  cells: (AttendanceRowStatus | null)[][];
}) {
  const t = useChartTheme();
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const size = 20;
  const gap = 2;
  const labelW = 92;
  const selStatus = sel ? cells[sel.r]?.[sel.c] : null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ minHeight: 30 }}>
        {sel ? (
          <Tooltip>
            {rows[sel.r]?.label} · {cols[sel.c]?.label}: {selStatus ? selStatus.toLowerCase() : "not enrolled yet"}
          </Tooltip>
        ) : (
          <Text style={{ color: t.muted, fontSize: 12 }}>Tap a cell for details.</Text>
        )}
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: labelW, gap }}>
          {rows.map((r) => (
            <Text key={r.id} numberOfLines={1} style={{ height: size, lineHeight: size, color: t.text, fontSize: 11 }}>
              {r.label}
            </Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <Svg width={cols.length * (size + gap)} height={rows.length * (size + gap)}>
            {cells.map((row, ri) =>
              row.map((st, ci) => {
                const x = ci * (size + gap);
                const y = ri * (size + gap);
                const active = sel?.r === ri && sel?.c === ci;
                return [
                  <Rect
                    key={`${ri}-${ci}`}
                    x={x}
                    y={y}
                    width={size}
                    height={size}
                    rx={3}
                    fill={st ? t.status[st] : t.grid}
                    opacity={st ? 1 : 0.4}
                    stroke={active ? t.text : undefined}
                    strokeWidth={active ? 2 : 0}
                    onPress={() => setSel({ r: ri, c: ci })}
                  />,
                  st ? (
                    <SvgText key={`${ri}-${ci}t`} x={x + size / 2} y={y + 14} fontSize={10} fontWeight="700" fill={t.statusInk[st]} textAnchor="middle" onPress={() => setSel({ r: ri, c: ci })}>
                      {STATUS_LETTER[st]}
                    </SvgText>
                  ) : null,
                ];
              }),
            )}
          </Svg>
        </ScrollView>
      </View>
      <StatusLegend />
    </View>
  );
}
