import { Stack, useLocalSearchParams } from "expo-router";
import type { AttendanceRowStatus } from "@attendance/shared";
import { Badge, Banner, Body, Card, fmtDay, fmtPct, H2, Loading, Row, Screen, StatTile, type Tone } from "@attendance/mobile-core";
import { useClass, useStudentDetail } from "@/lib/queries";

const tone: Record<AttendanceRowStatus, Tone> = { PRESENT: "good", LATE: "warn", EXCUSED: "neutral", ABSENT: "bad" };

export default function StudentDetailScreen() {
  const { classId, studentId } = useLocalSearchParams<{ classId: string; studentId: string }>();
  const cls = useClass(classId);
  const q = useStudentDetail(classId, studentId);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Screen><Banner tone="bad">Could not load this student.</Banner></Screen>;
  const d = q.data;
  const threshold = cls.data?.thresholdPct ?? 80;
  const below = d.pct !== null && d.pct < threshold;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: d.student.fullName }} />
      <Body muted>{d.student.indexNumber}</Body>
      <Row style={{ flexWrap: "wrap" }}>
        <StatTile label="Attendance" value={fmtPct(d.pct)} sub={`requirement ${threshold}%`} tone={below ? "bad" : "good"} />
        <StatTile label="Best possible" value={fmtPct(d.maxAchievablePct)} sub="if they attend all remaining" />
        <StatTile label="Current streak" value={String(d.currentStreak)} sub={`longest ${d.longestStreak}`} />
      </Row>
      {below ? (
        <Banner tone="bad">
          {d.sessionsNeeded === null
            ? `Below ${threshold}% and can no longer reach it this term.`
            : `Below ${threshold}%: needs ${d.sessionsNeeded} consecutive session${d.sessionsNeeded === 1 ? "" : "s"} to recover.`}
        </Banner>
      ) : null}
      <H2>History</H2>
      {d.timeline
        .slice()
        .reverse()
        .map((t) => (
          <Card key={t.sessionId}>
            <Row style={{ justifyContent: "space-between" }}>
              <Body style={{ fontWeight: "600", flex: 1 }}>{t.name}</Body>
              <Badge label={t.status} tone={tone[t.status]} />
            </Row>
            <Body muted>
              {fmtDay(t.startsAt)}
              {t.minutesFromStart !== null ? ` · checked in ${t.minutesFromStart >= 0 ? "+" : ""}${t.minutesFromStart} min` : ""}
            </Body>
          </Card>
        ))}
    </Screen>
  );
}
