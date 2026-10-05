import { useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Empty,
  fmtRange,
  fmtTime,
  H2,
  relative,
  Row,
  Screen,
  spacing,
  type Tone,
} from "@attendance/mobile-core";
import { Hce, isPositiveResult, type HceStatus, type TapEntry } from "../../../modules/attendance-hce";
import { useAppState } from "@/lib/context";
import { useMe, useUpcomingSessions, type StudentSession } from "@/lib/queries";

const statusTone: Record<string, Tone> = { PRESENT: "good", LATE: "warn", EXCUSED: "neutral" };

export default function HomeScreen() {
  const { identity } = useAppState();
  const me = useMe();
  const sessions = useUpcomingSessions();
  const [nfc, setNfc] = useState<HceStatus>(identity.status);
  const [taps, setTaps] = useState<TapEntry[]>(() => Hce.getRecentTaps());

  const refreshNfc = useCallback(() => setNfc(Hce.getStatus()), []);
  useFocusEffect(refreshNfc);
  useEffect(() => {
    // NFC may be switched on in system settings while we're in the background.
    const sub = AppState.addEventListener("change", (s) => s === "active" && refreshNfc());
    const tapSub = Hce.addTapListener(() => {
      setTaps(Hce.getRecentTaps());
      sessions.refetch();
    });
    return () => {
      sub.remove();
      tapSub.remove();
    };
  }, [refreshNfc, sessions]);

  const now = Date.now();
  const list = sessions.data ?? [];
  const live = list.find((s) => !s.cancelledAt && new Date(s.startsAt).getTime() - 15 * 60_000 <= now && new Date(s.endsAt).getTime() >= now);
  const upcoming = list.filter((s) => s !== live).slice(0, 8);

  return (
    <Screen refreshing={sessions.isRefetching} onRefresh={() => { sessions.refetch(); me.refetch(); refreshNfc(); }}>
      <ReadinessCard nfc={nfc} bound={me.data?.bound} deviceId={identity.deviceId} />

      {live ? <LiveSessionCard session={live} /> : null}

      <H2>Upcoming</H2>
      {sessions.error ? <Banner tone="bad">Could not load sessions. Pull to retry.</Banner> : null}
      {upcoming.length === 0 && !sessions.isLoading ? (
        <Empty title="No upcoming sessions" hint="Sessions your lecturers schedule will appear here. You get a reminder 30 minutes before each one." />
      ) : (
        upcoming.map((s) => (
          <Card key={s.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <Body style={{ fontWeight: "600", flex: 1 }}>
                {s.className} · {s.name}
              </Body>
              {s.cancelledAt ? <Badge label="Cancelled" tone="bad" /> : <Body muted>{relative(s.startsAt)}</Body>}
            </Row>
            <Body muted>{fmtRange(s.startsAt, s.endsAt)}</Body>
          </Card>
        ))
      )}

      {taps.length > 0 ? (
        <>
          <H2>Recent taps</H2>
          {taps.slice(0, 5).map((t) => (
            <Card key={t.at}>
              <Row style={{ justifyContent: "space-between" }}>
                <Badge label={t.resultName ?? String(t.result)} tone={isPositiveResult(t.result) ? "good" : "bad"} />
                <Body muted>{fmtTime(new Date(t.at))}</Body>
              </Row>
              {t.message ? <Body>{t.message}</Body> : null}
              {t.signMs != null ? <Body muted>Signed in {t.signMs.toFixed(0)} ms</Body> : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function ReadinessCard({ nfc, bound, deviceId }: { nfc: HceStatus; bound?: boolean; deviceId: string }) {
  if (!nfc.nfcSupported || !nfc.hceSupported) {
    return <Banner tone="bad">This phone cannot act as an NFC card (no NFC or no Host Card Emulation). Ask your lecturer to mark you manually.</Banner>;
  }
  if (!nfc.nfcEnabled) {
    return (
      <Card>
        <Banner tone="warn">NFC is turned off. Turn it on to check in.</Banner>
        <Button title="Open NFC settings" onPress={() => Hce.openNfcSettings()} />
      </Card>
    );
  }
  if (bound === false) {
    return (
      <Card>
        <H2>Not enrolled yet</H2>
        <Body>Ask your lecturer to add you to their class: they type your name and index number, then you hold this phone against theirs.</Body>
        <Body muted>Device code: {deviceId.slice(0, 8).toUpperCase()}</Body>
      </Card>
    );
  }
  return (
    <Card>
      <Row>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#1E8E5A" }} />
        <H2>Ready to check in</H2>
      </Row>
      <Body muted>Unlock your screen and hold the back of your phone against your lecturer's phone. You don't need to open this app.</Body>
    </Card>
  );
}

function LiveSessionCard({ session }: { session: StudentSession }) {
  const done = session.myStatus;
  return (
    <Card style={{ gap: spacing.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Badge label="Check-in open" tone="good" />
        {done ? <Badge label={done} tone={statusTone[done] ?? "neutral"} /> : null}
      </Row>
      <H2>
        {session.className} · {session.name}
      </H2>
      <Body muted>{fmtRange(session.startsAt, session.endsAt)}</Body>
      <Body>{done ? "You're checked in for this session." : "Tap your phone on the lecturer's phone now."}</Body>
    </Card>
  );
}
