import { router } from "expo-router";
import { useState } from "react";
import type { ClassDto } from "@attendance/shared";
import { Banner, Body, Button, Card, errorMessage, fmtDay, fmtPct, H2, Loading, Row, StatTile } from "@attendance/mobile-core";
import { shareCsv } from "@/lib/share";
import { useArrivals, useMatrix, usePatterns, useStudentRows, useSummary, useTrend } from "@/lib/queries";
import { Columns, PercentBars, StatusMatrix, StatusSplit, TrendLine } from "./charts";

/** Class analytics (docs/PLAN.md §7): KPIs, per-student %, trend, matrix, punctuality, weekday pattern, export. */
export function InsightsPanel({ cls }: { cls: ClassDto }) {
  const summary = useSummary(cls.id);
  const students = useStudentRows(cls.id);
  const trend = useTrend(cls.id);
  const matrix = useMatrix(cls.id);
  const arrivals = useArrivals(cls.id);
  const patterns = usePatterns(cls.id);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (summary.isLoading) return <Loading />;
  const s = summary.data;
  if (!s) return <Banner tone="bad">Could not load analytics.</Banner>;

  const exportCsv = async (pseudonymise: boolean) => {
    setExporting(true);
    setExportError(null);
    try {
      const name = `${(cls.code || cls.name).replace(/\W+/g, "_")}_attendance${pseudonymise ? "_pseudonymised" : ""}.csv`;
      await shareCsv(`/classes/${cls.id}/export/attendance.csv`, name, { pseudonymise });
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Row style={{ flexWrap: "wrap" }}>
        <StatTile label="Class average" value={fmtPct(s.classAvgPct)} sub={`${s.sessionsHeld} sessions held`} />
        <StatTile
          label={`Below ${s.thresholdPct}%`}
          value={String(s.belowThresholdCount)}
          sub={`of ${s.enrolledCount} students`}
          tone={s.belowThresholdCount > 0 ? "bad" : "good"}
        />
        <StatTile label="On time" value={fmtPct(s.onTimePct)} sub="of check-ins" />
        <StatTile label="Remaining" value={String(s.sessionsRemaining)} sub="sessions scheduled" />
      </Row>

      <Card>
        <H2>Check-in status</H2>
        <StatusSplit split={{ PRESENT: s.statusSplit.present, LATE: s.statusSplit.late, EXCUSED: s.statusSplit.excused, ABSENT: s.statusSplit.absent }} />
      </Card>

      <Card>
        <H2>Attendance by student</H2>
        <Body muted>Lowest first. Tap a student for their history.</Body>
        {students.data?.length ? (
          <PercentBars
            threshold={s.thresholdPct}
            rows={students.data.map((r) => ({
              key: r.studentId,
              label: `${r.fullName} (${r.indexNumber})`,
              sub: r.belowThreshold
                ? r.sessionsNeeded === null
                  ? "can't reach target"
                  : `needs ${r.sessionsNeeded} in a row`
                : `${r.attended}/${r.counted}`,
              value: r.pct,
            }))}
            onPress={(id) => router.push(`/class/${cls.id}/student/${id}`)}
          />
        ) : (
          <Body muted>No students yet.</Body>
        )}
      </Card>

      <Card>
        <H2>Attendance per session</H2>
        {trend.data?.items.length ? (
          <TrendLine
            threshold={s.thresholdPct}
            points={trend.data.items.map((i) => ({ label: fmtDay(i.startsAt), sub: i.name, value: i.presentPct }))}
          />
        ) : (
          <Body muted>Appears after the first session ends.</Body>
        )}
      </Card>

      <Card>
        <H2>Who came when</H2>
        {matrix.data?.sessions.length ? (
          <StatusMatrix
            rows={matrix.data.students.map((st) => ({ id: st.id, label: st.fullName }))}
            cols={matrix.data.sessions.map((se) => ({ id: se.id, label: `${se.name} (${fmtDay(se.startsAt)})` }))}
            cells={matrix.data.cells}
          />
        ) : (
          <Body muted>No finished sessions yet.</Body>
        )}
      </Card>

      <Card>
        <H2>Arrival time</H2>
        <Body muted>Minutes relative to the session start (negative = early).</Body>
        {arrivals.data ? (
          <Columns
            everyNthLabel={3}
            data={arrivals.data.bins.map((b) => ({
              label: String(b.minuteFrom),
              value: b.count,
              tip: `${b.minuteFrom} to ${b.minuteTo} min: ${b.count} check-ins`,
            }))}
          />
        ) : null}
      </Card>

      <Card>
        <H2>Attendance by weekday</H2>
        {patterns.data ? (
          <Columns
            maxValue={100}
            unit="%"
            data={patterns.data.byWeekday.map((d) => ({
              label: d.label,
              value: d.pct ?? 0,
              tip: d.sessions ? `${d.label}: ${d.pct}% over ${d.sessions} sessions` : `${d.label}: no sessions`,
            }))}
          />
        ) : null}
      </Card>

      <Card>
        <H2>Export</H2>
        <Body muted>CSV of every student × session. The pseudonymised version replaces names with hashes (for the data package).</Body>
        {exportError ? <Banner tone="bad">{exportError}</Banner> : null}
        <Button title="Export CSV" onPress={() => exportCsv(false)} loading={exporting} />
        <Button title="Export pseudonymised CSV" variant="secondary" onPress={() => exportCsv(true)} disabled={exporting} />
      </Card>
    </>
  );
}
