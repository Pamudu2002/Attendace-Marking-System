import { useCallback, useEffect, useState } from "react";
import { Switch } from "react-native";
import { useFocusEffect } from "expo-router";
import { Badge, Banner, Body, Button, Card, errorMessage, Field, H2, Row, Screen } from "@attendance/mobile-core";
import { Chips } from "@/components/Chips";
import { recentTapEvents, type LocalTapStats } from "@/lib/db";
import { defaultConditions, getConditions, hostModel, saveConditions, type Conditions } from "@/lib/experiment";
import { shareCsv } from "@/lib/share";
import { syncAll } from "@/lib/sync";

const SCREEN_STATES = ["unlocked-foreground", "unlocked-app-killed", "locked-screen-on", "screen-off"] as const;
const CASES = ["no-case", "case"] as const;
const ORIENTATIONS = ["back-to-back-centred", "offset"] as const;

function stats(values: number[]) {
  if (values.length === 0) return { mean: null as number | null, sd: null as number | null };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)) : 0;
  return { mean, sd };
}

/**
 * Experiment mode (docs/PLAN.md §8): label conditions, then every tap in check-in is logged with them.
 * Shows a quick per-condition summary; the real analysis uses the exported CSV.
 */
export default function ExperimentScreen() {
  const [c, setC] = useState<Conditions>(defaultConditions);
  const [saved, setSaved] = useState(true);
  const [data, setData] = useState<LocalTapStats | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getConditions().then(setC);
  }, []);
  const load = useCallback(() => {
    recentTapEvents(1000).then(setData);
  }, []);
  useFocusEffect(load);

  const update = (patch: Partial<Conditions>) => {
    setC((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  // Group logged taps by run + screen state.
  const groups = new Map<string, { n: number; ok: number; total: number[] }>();
  for (const r of data?.rows ?? []) {
    const cond = r.conditions as Record<string, string> | null | undefined;
    if (!cond?.runId) continue;
    const key = `${cond.runId} · ${cond.screenState ?? "?"}${cond.studentPhone ? ` · ${cond.studentPhone}` : ""}`;
    const g = groups.get(key) ?? { n: 0, ok: 0, total: [] };
    g.n++;
    if (r.outcome === "OK" || r.outcome === "DUPLICATE") {
      g.ok++;
      if (typeof r.tTotalMs === "number") g.total.push(r.tTotalMs);
    }
    groups.set(key, g);
  }

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <H2>Experiment mode</H2>
          <Switch value={c.enabled} onValueChange={(v) => update({ enabled: v })} />
        </Row>
        <Body muted>
          Every tap is timed and logged (SELECT, AUTH incl. Keystore signing, verification). While on, taps are labelled with
          the conditions below. Host phone: {hostModel()}.
        </Body>
      </Card>

      <Card>
        <Field label="Run ID" value={c.runId} onChangeText={(v) => update({ runId: v })} autoCapitalize="none" />
        <Field label="Student phone (model)" value={c.studentPhone} onChangeText={(v) => update({ studentPhone: v })} placeholder="Galaxy A54 / Android 14" />
        <Chips label="Student phone state" value={c.screenState} options={SCREEN_STATES} onChange={(v) => update({ screenState: v })} />
        <Chips label="Phone case" value={c.case} options={CASES} onChange={(v) => update({ case: v })} />
        <Chips label="Tap placement" value={c.orientation} options={ORIENTATIONS} onChange={(v) => update({ orientation: v })} />
        <Field label="Notes" value={c.notes} onChangeText={(v) => update({ notes: v })} />
        <Button
          title={saved ? "Saved" : "Save conditions"}
          onPress={async () => {
            await saveConditions(c);
            setSaved(true);
          }}
          disabled={saved}
        />
      </Card>

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <H2>Logged taps</H2>
          {data ? <Badge label={`${data.unsynced} not uploaded`} tone={data.unsynced ? "warn" : "good"} /> : null}
        </Row>
        {groups.size === 0 ? <Body muted>No labelled taps yet. Turn on experiment mode and run a check-in.</Body> : null}
        {[...groups.entries()].map(([key, g]) => {
          const s = stats(g.total);
          return (
            <Body key={key}>
              {key}: {g.ok}/{g.n} read ({Math.round((100 * g.ok) / g.n)}%) · {s.mean === null ? "–" : `${s.mean.toFixed(0)} ± ${s.sd!.toFixed(0)} ms`}
            </Body>
          );
        })}
        {msg ? <Banner tone="neutral">{msg}</Banner> : null}
        <Button
          title="Upload now"
          variant="secondary"
          onPress={async () => {
            await syncAll();
            load();
            setMsg("Upload finished.");
          }}
        />
        <Button
          title="Export tap CSV"
          onPress={async () => {
            try {
              await syncAll();
              await shareCsv("/telemetry/taps.csv", "tap_events.csv");
            } catch (e) {
              setMsg(errorMessage(e));
            }
          }}
        />
        <Button
          title="Export reminder-delay CSV"
          variant="secondary"
          onPress={async () => {
            try {
              await shareCsv("/telemetry/notifications.csv", "notifications.csv");
            } catch (e) {
              setMsg(errorMessage(e));
            }
          }}
        />
      </Card>
    </Screen>
  );
}
