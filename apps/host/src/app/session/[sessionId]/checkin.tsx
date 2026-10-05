import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Banner, Body, Button, Card, errorMessage, fmtTime, H2, Loading, Row, Screen, StatTile, usePalette, type Tone } from "@attendance/mobile-core";
import { NfcReader, type TapEvent } from "../../../../modules/nfc-reader";
import { api } from "@/lib/api";
import { insertAttendance, kvGet, sessionRecords, type PendingRecord } from "@/lib/db";
import { getConditions, recordTap, type Conditions } from "@/lib/experiment";
import { qk, type SessionDetail } from "@/lib/queries";
import { loadRoster, syncAll } from "@/lib/sync";
import type { SessionAttendanceDto } from "@attendance/shared";

interface Verdict {
  tone: Tone;
  title: string;
  detail: string;
  at: number;
}

const OUTCOME_TEXT: Record<string, { tone: Tone; title: string }> = {
  OK: { tone: "good", title: "Checked in" },
  DUPLICATE: { tone: "neutral", title: "Already checked in" },
  UNKNOWN_DEVICE: { tone: "bad", title: "Phone not enrolled in this class" },
  NOT_ENROLLED: { tone: "bad", title: "Not enrolled" },
  BAD_SIGNATURE: { tone: "bad", title: "Verification failed" },
  OUTSIDE_WINDOW: { tone: "warn", title: "Check-in is closed" },
  TAG_LOST: { tone: "warn", title: "Moved too soon. Tap again." },
  TIMEOUT: { tone: "warn", title: "Timed out. Tap again." },
  PROTOCOL_ERROR: { tone: "bad", title: "Could not read phone" },
};

const ERROR_DETAIL: Record<string, string> = {
  STUDENT_APP_NOT_INSTALLED: "The student app isn't installed on that phone.",
  STUDENT_APP_NOT_REGISTERED: "The student app hasn't been set up yet (open it once with internet).",
};

/**
 * Live check-in (docs/IDENTITY_AND_AUTH.md §3.3). The reader verifies each signature on-device with the cached
 * roster keys, so this works offline; verified taps are queued in SQLite and synced in the background.
 */
export default function CheckInScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const c = usePalette();
  const qc = useQueryClient();
  const [ready, setReady] = useState<{ session: SessionDetail; rosterSize: number; offline: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [runStats, setRunStats] = useState({ taps: 0, ok: 0, totalMs: 0 });
  const lastRosterRefresh = useRef(0);
  const sessionRef = useRef<SessionDetail | null>(null);

  const reloadRecords = useCallback(() => sessionRecords(sessionId).then(setRecords), [sessionId]);

  const start = useCallback(
    async (forceRoster = false) => {
      setError(null);
      let session: SessionDetail | null = null;
      let serverMarked: string[] = [];
      let offline = false;
      try {
        session = await api.get<SessionDetail>(`/sessions/${sessionId}`);
        const att = await api.get<SessionAttendanceDto>(`/sessions/${sessionId}/attendance`);
        serverMarked = att.items.filter((i) => i.status !== "ABSENT").map((i) => i.studentId);
      } catch {
        session = await kvGet<SessionDetail>(`session:${sessionId}`);
        offline = true;
      }
      if (!session) throw new Error("No connection and this session was never opened before on this phone.");
      sessionRef.current = session;
      const roster = await loadRoster(session.classId);
      if (forceRoster) lastRosterRefresh.current = Date.now();
      const local = await sessionRecords(sessionId);
      setRecords(local);
      const rosterSize = await NfcReader.startAttendance({
        sessionId,
        label: `${session.class.code ?? session.class.name} ${session.name}`.slice(0, 40),
        startsAt: new Date(session.startsAt).getTime(),
        endsAt: new Date(session.endsAt).getTime(),
        checkInOpensBeforeMin: session.class.checkInOpensBeforeMin,
        lateAfterMin: session.class.lateAfterMin,
        roster: roster.items,
        alreadyMarked: [...new Set([...serverMarked, ...local.map((r) => r.student_id)])],
      });
      setReady({ session, rosterSize, offline: offline || roster.fromCache });
    },
    [sessionId],
  );

  useEffect(() => {
    getConditions().then(setConditions);
    start().catch((e) => setError(errorMessage(e)));
    const sub = NfcReader.onTap((e) => onTap(e));
    return () => {
      sub.remove();
      NfcReader.stop();
      syncAll().then(() => {
        qc.invalidateQueries({ queryKey: qk.attendance(sessionId) });
        qc.invalidateQueries({ queryKey: qk.session(sessionId) });
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onTap(e: TapEvent) {
    recordTap(e);
    setRunStats((s) => ({
      taps: s.taps + 1,
      ok: s.ok + (e.outcome === "OK" || e.outcome === "DUPLICATE" ? 1 : 0),
      totalMs: s.totalMs + (e.tTotalMs ?? 0),
    }));
    const text = OUTCOME_TEXT[e.outcome] ?? { tone: "bad" as Tone, title: e.outcome };
    const who = e.fullName ? `${e.fullName} (${e.indexNumber})` : "";
    setVerdict({
      tone: e.outcome === "OK" && e.status === "LATE" ? "warn" : text.tone,
      title: e.outcome === "OK" && e.status === "LATE" ? "Checked in (late)" : text.title,
      detail: [who, ERROR_DETAIL[e.errorDetail ?? ""] ?? (e.outcome === "OK" ? "" : (e.errorDetail ?? ""))].filter(Boolean).join(" · "),
      at: Date.now(),
    });

    if (e.outcome === "OK" && e.deviceId && e.studentId && e.nonce && e.signature && e.hostTime) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await insertAttendance({
        client_record_id: Crypto.randomUUID(),
        session_id: sessionId,
        device_id: e.deviceId,
        student_id: e.studentId,
        full_name: e.fullName ?? "",
        index_number: e.indexNumber ?? "",
        status: e.status ?? "PRESENT",
        tapped_at: new Date(e.hostTime).toISOString(),
        nonce: e.nonce,
        host_time: e.hostTime,
        signature: e.signature,
      });
      reloadRecords();
      syncAll();
    } else if (e.outcome === "DUPLICATE") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // A newly enrolled student may be missing from the cached roster: refresh it (at most every 20 s).
      if (e.outcome === "UNKNOWN_DEVICE" && Date.now() - lastRosterRefresh.current > 20_000) {
        start(true).catch(() => undefined);
      }
    }
  }

  if (error) {
    return (
      <Screen>
        <Banner tone="bad">{error}</Banner>
        <Button title="Try again" onPress={() => start().catch((e) => setError(errorMessage(e)))} />
      </Screen>
    );
  }
  if (!ready) return <Loading />;

  const status = NfcReader.getStatus();
  const s = ready.session;
  const now = Date.now();
  const opens = new Date(s.startsAt).getTime() - s.class.checkInOpensBeforeMin * 60_000;
  const windowNote =
    now < opens ? `Check-in opens at ${fmtTime(new Date(opens))}.` : now > new Date(s.endsAt).getTime() ? "This session has ended; taps will be refused." : null;
  const toneBg = { good: c.goodBg, warn: c.warnBg, bad: c.badBg, neutral: c.neutralBg };
  const toneFg = { good: c.good, warn: c.warn, bad: c.bad, neutral: c.text };

  return (
    <Screen>
      {!status.nfcEnabled ? (
        <Card>
          <Banner tone="bad">NFC is off. Turn it on to read students' phones.</Banner>
          <Button title="Open NFC settings" onPress={() => NfcReader.openNfcSettings()} />
        </Card>
      ) : null}
      {windowNote ? <Banner tone="warn">{windowNote}</Banner> : null}
      {ready.offline ? <Banner tone="warn">Offline: using the saved roster. Check-ins sync when you're back online.</Banner> : null}
      {ready.rosterSize === 0 ? <Banner tone="warn">No students with linked phones in this class yet.</Banner> : null}

      <View style={{ borderRadius: 16, padding: 24, minHeight: 150, justifyContent: "center", alignItems: "center", gap: 6, backgroundColor: verdict ? toneBg[verdict.tone] : c.card, borderWidth: 1, borderColor: c.border }}>
        {verdict ? (
          <>
            <Text style={{ color: toneFg[verdict.tone], fontSize: 24, fontWeight: "700", textAlign: "center" }}>{verdict.title}</Text>
            {verdict.detail ? <Body style={{ textAlign: "center" }}>{verdict.detail}</Body> : null}
            <Body muted>{fmtTime(new Date(verdict.at))}</Body>
          </>
        ) : (
          <>
            <H2>Ready</H2>
            <Body muted style={{ textAlign: "center" }}>
              Students: unlock your phone and hold its back against the back of this phone.
            </Body>
          </>
        )}
      </View>

      <Row style={{ flexWrap: "wrap" }}>
        <StatTile label="Checked in" value={`${records.length}`} sub={`of ${s.enrolledCount} enrolled`} />
        <StatTile label="Waiting to sync" value={`${records.filter((r) => !r.synced_at).length}`} sub="uploaded automatically" />
      </Row>

      {conditions?.enabled ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <H2>Experiment: {conditions.runId}</H2>
            <Badge label="logging" tone="warn" />
          </Row>
          <Body muted>
            {[conditions.studentPhone, conditions.screenState, conditions.case, conditions.orientation].filter(Boolean).join(" · ") || "No conditions set"}
          </Body>
          <Body>
            {runStats.taps} taps · {runStats.taps ? Math.round((100 * runStats.ok) / runStats.taps) : 0}% read · mean{" "}
            {runStats.taps ? Math.round(runStats.totalMs / runStats.taps) : 0} ms
          </Body>
        </Card>
      ) : null}

      <H2>Checked in</H2>
      {records.length === 0 ? <Body muted>No one yet.</Body> : null}
      {records.map((r) => (
        <Card key={r.client_record_id}>
          <Row style={{ justifyContent: "space-between" }}>
            <Body style={{ fontWeight: "600", flex: 1 }}>{r.full_name}</Body>
            <Badge label={r.status} tone={r.status === "LATE" ? "warn" : "good"} />
          </Row>
          <Body muted>
            {r.index_number} · {fmtTime(r.tapped_at)} ·{" "}
            {r.synced_at ? (r.sync_result === "rejected" ? `rejected (${r.sync_reason})` : "synced") : "not synced yet"}
          </Body>
        </Card>
      ))}
    </Screen>
  );
}
