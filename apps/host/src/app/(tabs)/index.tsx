import { useState } from "react";
import { router } from "expo-router";
import { Badge, Banner, Body, Button, Card, Empty, fmtPct, fmtRange, H2, Row, Screen } from "@attendance/mobile-core";
import { useClasses } from "@/lib/queries";

export default function ClassesScreen() {
  const [archived, setArchived] = useState(false);
  const classes = useClasses(archived);
  return (
    <Screen refreshing={classes.isRefetching} onRefresh={() => classes.refetch()}>
      <Button title="+ New class" onPress={() => router.push("/class/new")} />
      {classes.error ? <Banner tone="bad">Could not load classes. Pull down to retry.</Banner> : null}
      {classes.data?.length === 0 ? (
        <Empty title={archived ? "No archived classes" : "No classes yet"} hint={archived ? undefined : "Create a class, then add students by tapping their phones."} />
      ) : null}
      {classes.data?.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/class/${c.id}`)}>
          <Row style={{ justifyContent: "space-between" }}>
            <H2>{c.code ? `${c.code} · ${c.name}` : c.name}</H2>
            <Badge label={`${c.studentCount} students`} />
          </Row>
          <Body muted>
            {c.sessionCount} sessions · requirement {fmtPct(c.thresholdPct)}
          </Body>
          {c.nextSession ? <Body>Next: {c.nextSession.name} · {fmtRange(c.nextSession.startsAt, c.nextSession.endsAt)}</Body> : null}
        </Card>
      ))}
      <Button title={archived ? "Show active classes" : "Show archived classes"} variant="secondary" onPress={() => setArchived(!archived)} />
    </Screen>
  );
}
