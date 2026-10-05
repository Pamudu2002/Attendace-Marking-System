import { Stack, useLocalSearchParams } from "expo-router";
import { Badge, Banner, Body, Card, fmtPct, fmtRange, H2, Loading, Row, Screen, StatTile, type Tone } from "@attendance/mobile-core";
import { useClassDetail } from "@/lib/queries";
import { pctTone } from "@/lib/ui";

const tone: Record<string, Tone> = { PRESENT: "good", LATE: "warn", EXCUSED: "neutral", ABSENT: "bad", UPCOMING: "neutral", CANCELLED: "neutral" };

export default function ClassDetailScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const q = useClassDetail(classId);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Screen><Banner tone="bad">Could not load this class.</Banner></Screen>;
  const d = q.data;
  const threshold = d.class.thresholdPct;
  const below = d.attendancePct !== null && d.attendancePct < threshold;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Stack.Screen options={{ title: d.class.code ?? d.class.name }} />
      <H2>{d.class.name}</H2>
      <Body muted>{d.class.teacherName}</Body>
      <Row style={{ flexWrap: "wrap" }}>
        <StatTile label="My attendance" value={fmtPct(d.attendancePct)} sub={`Required ${threshold}%`} tone={pctTone(d.attendancePct, threshold)} />
        <StatTile label="Best possible" value={fmtPct(d.maxAchievablePct)} sub="if you attend every remaining session" />
      </Row>
      {below ? (
        d.sessionsNeeded === null ? (
          <Banner tone="bad">You can no longer reach {threshold}% in this class. Talk to your lecturer.</Banner>
        ) : (
          <Banner tone="warn">
            Attend the next {d.sessionsNeeded} session{d.sessionsNeeded === 1 ? "" : "s"} in a row to get back to {threshold}%.
          </Banner>
        )
      ) : null}

      <H2>Sessions</H2>
      {d.history.map((h) => (
        <Card key={h.sessionId}>
          <Row style={{ justifyContent: "space-between" }}>
            <Body style={{ fontWeight: "600", flex: 1 }}>{h.name}</Body>
            <Badge label={h.status} tone={tone[h.status] ?? "neutral"} />
          </Row>
          <Body muted>{fmtRange(h.startsAt, h.endsAt)}</Body>
        </Card>
      ))}
    </Screen>
  );
}
