import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { AttendanceRowStatus } from "@attendance/shared";
import { Badge, Banner, Body, Button, Card, errorMessage, fmtRange, fmtTime, H2, Loading, Row, Screen, type Tone } from "@attendance/mobile-core";
import { api } from "@/lib/api";
import { kvSet, sessionRecords, type PendingRecord } from "@/lib/db";
import { qk, useSession, useSessionAttendance } from "@/lib/queries";
import { syncAll } from "@/lib/sync";

const tone: Record<AttendanceRowStatus, Tone> = { PRESENT: "good", LATE: "warn", EXCUSED: "neutral", ABSENT: "bad" };

export default function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const session = useSession(sessionId);
  const attendance = useSessionAttendance(sessionId);
  const [local, setLocal] = useState<PendingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(() => {
    sessionRecords(sessionId).then(setLocal);
  }, [sessionId]);
  useFocusEffect(loadLocal);

  useEffect(() => {
    if (session.data) kvSet(`session:${sessionId}`, session.data);
  }, [session.data, sessionId]);

  if (session.isLoading) return <Loading />;
  const s = session.data;
  if (!s) return <Screen><Banner tone="bad">Could not load this session.</Banner></Screen>;

  const refresh = async () => {
    await syncAll();
    loadLocal();
    qc.invalidateQueries({ queryKey: qk.session(sessionId) });
    qc.invalidateQueries({ queryKey: qk.attendance(sessionId) });
  };

  const pendingIds = new Set(local.filter((r) => !r.synced_at).map((r) => r.student_id));
  const rejected = local.filter((r) => r.sync_result === "rejected");
  const items = (attendance.data?.items ?? []).map((i) => {
    const pending = pendingIds.has(i.studentId) && i.status === "ABSENT";
    const rec = local.find((r) => r.student_id === i.studentId);
    return pending && rec ? { ...i, status: rec.status as AttendanceRowStatus, tappedAt: rec.tapped_at, pending: true } : { ...i, pending: false };
  });
  const present = items.filter((i) => i.status !== "ABSENT").length;
  const ended = new Date(s.endsAt).getTime() < Date.now();

  const setStatus = (studentId: string, name: string) =>
    Alert.alert(name, "Set attendance manually", [
      ...(["PRESENT", "LATE", "EXCUSED"] as const).map((status) => ({
        text: status.charAt(0) + status.slice(1).toLowerCase(),
        onPress: async () => {
          try {
            await api.put(`/sessions/${sessionId}/attendance/${studentId}`, { status, note: "Set by lecturer" });
            refresh();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      })),
      {
        text: "Clear (absent)",
        style: "destructive" as const,
        onPress: async () => {
          try {
            await api.del(`/sessions/${sessionId}/attendance/${studentId}`);
            refresh();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ]);

  const cancelSession = () =>
    Alert.alert("Cancel session?", "Students are notified and it no longer counts for attendance.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel session",
        style: "destructive",
        onPress: async () => {
          try {
            await api.post(`/sessions/${sessionId}/cancel`);
            await qc.invalidateQueries({ queryKey: qk.class(s.classId) });
            refresh();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen refreshing={attendance.isRefetching} onRefresh={refresh}>
      <Stack.Screen options={{ title: s.name }} />
      <Card>
        <H2>
          {s.class.code ?? s.class.name} · {s.name}
        </H2>
        <Body muted>{fmtRange(s.startsAt, s.endsAt)}</Body>
        <Row>
          {s.cancelledAt ? <Badge label="Cancelled" tone="bad" /> : null}
          <Badge label={`${present} / ${items.length} present`} tone={present > 0 ? "good" : "neutral"} />
          {pendingIds.size > 0 ? <Badge label={`${pendingIds.size} waiting to sync`} tone="warn" /> : null}
        </Row>
        <Body muted>
          Check-in opens {s.class.checkInOpensBeforeMin} min before the start; later than {s.class.lateAfterMin} min counts as late.
        </Body>
      </Card>

      {!s.cancelledAt ? <Button title="Start NFC check-in" onPress={() => router.push(`/session/${sessionId}/checkin`)} /> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {rejected.length > 0 ? (
        <Banner tone="bad">
          {rejected.length} offline check-in{rejected.length === 1 ? " was" : "s were"} rejected by the server ({[...new Set(rejected.map((r) => r.sync_reason))].join(", ")}).
        </Banner>
      ) : null}

      <H2>Students</H2>
      <Body muted>Tap a student to change their status by hand (e.g. forgot their phone).</Body>
      {items.map((i) => (
        <Card key={i.studentId} onPress={() => setStatus(i.studentId, i.fullName)}>
          <Row style={{ justifyContent: "space-between" }}>
            <Body style={{ fontWeight: "600", flex: 1 }}>{i.fullName}</Body>
            <Badge label={i.status === "ABSENT" && !ended ? "Not yet" : i.status} tone={i.status === "ABSENT" && !ended ? "neutral" : tone[i.status]} />
          </Row>
          <Body muted>
            {i.indexNumber}
            {i.tappedAt ? ` · ${fmtTime(i.tappedAt)}` : ""}
            {i.source === "MANUAL" ? " · manual" : ""}
            {i.pending ? " · not synced yet" : ""}
          </Body>
        </Card>
      ))}

      {!s.cancelledAt ? <Button title="Cancel session" variant="danger" onPress={cancelSession} /> : null}
    </Screen>
  );
}
