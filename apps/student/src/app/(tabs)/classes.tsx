import { router } from "expo-router";
import { Badge, Banner, Body, Card, Empty, fmtPct, fmtRange, H2, Row, Screen } from "@attendance/mobile-core";
import { useClasses } from "@/lib/queries";
import { pctTone } from "@/lib/ui";

export default function ClassesScreen() {
  const classes = useClasses();
  return (
    <Screen refreshing={classes.isRefetching} onRefresh={() => classes.refetch()}>
      {classes.error ? <Banner tone="bad">Could not load classes. Pull to retry.</Banner> : null}
      {classes.data?.length === 0 ? (
        <Empty title="No classes yet" hint="You'll see a class here after your lecturer enrols you by tapping your phone." />
      ) : null}
      {classes.data?.map((c) => (
        <Card key={c.classId} onPress={() => router.push(`/class/${c.classId}`)}>
          <Row style={{ justifyContent: "space-between" }}>
            <H2>{c.code ? `${c.code} · ${c.name}` : c.name}</H2>
            <Badge label={fmtPct(c.attendancePct)} tone={pctTone(c.attendancePct, c.thresholdPct)} />
          </Row>
          <Body muted>{c.teacherName}</Body>
          {c.nextSession ? <Body muted>Next: {fmtRange(c.nextSession.startsAt, c.nextSession.endsAt)}</Body> : null}
        </Card>
      ))}
    </Screen>
  );
}
