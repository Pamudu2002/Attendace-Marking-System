import { useState } from "react";
import { Switch } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Body, Button, errorMessage, Field, Row, Screen } from "@attendance/mobile-core";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { DateTimeField } from "@/components/DateTimeField";

function at(day: Date, time: Date) {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

/** Create a session (name + time window) for a calendar day, optionally repeating weekly. */
export default function NewSessionScreen() {
  const { classId, date } = useLocalSearchParams<{ classId: string; date?: string }>();
  const qc = useQueryClient();
  const initialDay = date ? new Date(`${date}T00:00:00`) : new Date();
  const [name, setName] = useState("Lecture");
  const [day, setDay] = useState(initialDay);
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setHours(8, 30, 0, 0);
    return d;
  });
  const [end, setEnd] = useState(() => {
    const d = new Date();
    d.setHours(10, 30, 0, 0);
    return d;
  });
  const [weekly, setWeekly] = useState(false);
  const [until, setUntil] = useState(() => new Date(initialDay.getTime() + 12 * 7 * 86_400_000));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startsAt = at(day, start);
  const endsAt = at(day, end);
  const valid = name.trim() && endsAt > startsAt;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
      if (weekly) {
        const u = new Date(until);
        u.setHours(23, 59, 0, 0);
        await api.post(`/classes/${classId}/sessions/bulk`, { ...body, repeat: { weekly: true, until: u.toISOString() } });
      } else {
        await api.post(`/classes/${classId}/sessions`, body);
      }
      await qc.invalidateQueries({ queryKey: qk.class(classId) });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Session name" value={name} onChangeText={setName} placeholder="Lecture 5" />
      <DateTimeField label="Date" mode="date" value={day} onChange={setDay} />
      <Row>
        <DateTimeField label="Starts" mode="time" value={start} onChange={setStart} />
        <DateTimeField label="Ends" mode="time" value={end} onChange={setEnd} />
      </Row>
      {endsAt <= startsAt ? <Banner tone="warn">The end time must be after the start time.</Banner> : null}
      <Row style={{ justifyContent: "space-between" }}>
        <Body>Repeat every week</Body>
        <Switch value={weekly} onValueChange={setWeekly} />
      </Row>
      {weekly ? (
        <>
          <DateTimeField label="Until" mode="date" value={until} onChange={setUntil} />
          <Body muted>Sessions are numbered automatically ("{name.trim() || "Lecture"} 1", "… 2", …).</Body>
        </>
      ) : null}
      <Body muted>Enrolled students get a push reminder 30 minutes before each session.</Body>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Button title={weekly ? "Create weekly sessions" : "Create session"} onPress={save} loading={busy} disabled={!valid} />
    </Screen>
  );
}
