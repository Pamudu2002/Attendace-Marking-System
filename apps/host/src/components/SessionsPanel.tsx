import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Calendar } from "react-native-calendars";
import type { SessionDto } from "@attendance/shared";
import { Badge, Body, Button, Card, dayKey, Empty, fmtRange, H2, Row, usePalette } from "@attendance/mobile-core";

/** Calendar of a class's sessions; tap a day to list its sessions, add one for that day. */
export function SessionsPanel({ classId, sessions }: { classId: string; sessions: SessionDto[] }) {
  const c = usePalette();
  const [selected, setSelected] = useState(dayKey(new Date()));

  const marked = useMemo(() => {
    const m: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string }> = {};
    for (const s of sessions) {
      if (s.cancelledAt) continue;
      m[dayKey(new Date(s.startsAt))] = { marked: true, dotColor: c.primary };
    }
    m[selected] = { ...(m[selected] ?? {}), selected: true, selectedColor: c.primary };
    return m;
  }, [sessions, selected, c.primary]);

  const daySessions = sessions.filter((s) => dayKey(new Date(s.startsAt)) === selected);
  const now = Date.now();
  const upcoming = sessions.filter((s) => !s.cancelledAt && new Date(s.endsAt).getTime() >= now).slice(0, 3);

  return (
    <>
      <Card style={{ padding: 4 }}>
        <Calendar
          key={c.bg}
          current={selected}
          markedDates={marked}
          onDayPress={(d: { dateString: string }) => setSelected(d.dateString)}
          firstDay={1}
          theme={{
            calendarBackground: c.card,
            dayTextColor: c.text,
            monthTextColor: c.text,
            textSectionTitleColor: c.muted,
            textDisabledColor: c.border,
            todayTextColor: c.primary,
            arrowColor: c.primary,
            selectedDayTextColor: c.primaryText,
          }}
        />
      </Card>
      <Button title={`+ Add session on ${selected}`} onPress={() => router.push(`/class/${classId}/session-new?date=${selected}`)} />

      <H2>{selected}</H2>
      {daySessions.length === 0 ? <Empty title="No sessions on this day" /> : null}
      {daySessions.map((s) => (
        <SessionCard key={s.id} s={s} />
      ))}

      {upcoming.length > 0 ? <H2>Coming up</H2> : null}
      {upcoming.map((s) => (
        <SessionCard key={`u-${s.id}`} s={s} />
      ))}
    </>
  );
}

function SessionCard({ s }: { s: SessionDto }) {
  const now = Date.now();
  const live = !s.cancelledAt && new Date(s.startsAt).getTime() - 30 * 60_000 <= now && new Date(s.endsAt).getTime() >= now;
  return (
    <Card onPress={() => router.push(`/session/${s.id}`)}>
      <Row style={{ justifyContent: "space-between" }}>
        <Body style={{ fontWeight: "600", flex: 1 }}>{s.name}</Body>
        {s.cancelledAt ? (
          <Badge label="Cancelled" tone="bad" />
        ) : live ? (
          <Badge label="Now" tone="good" />
        ) : s.presentCount !== undefined ? (
          <Badge label={`${s.presentCount}/${s.enrolledCount ?? "?"}`} />
        ) : null}
      </Row>
      <Body muted>{fmtRange(s.startsAt, s.endsAt)}</Body>
    </Card>
  );
}
