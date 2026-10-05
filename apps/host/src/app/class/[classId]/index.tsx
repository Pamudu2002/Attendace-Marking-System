import { useState } from "react";
import { Alert } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Loading, Screen } from "@attendance/mobile-core";
import { api } from "@/lib/api";
import { qk, useClass, useRoster, useSessions } from "@/lib/queries";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Segmented } from "@/components/Segmented";
import { SessionsPanel } from "@/components/SessionsPanel";
import { StudentsPanel } from "@/components/StudentsPanel";

const TABS = ["Sessions", "Students", "Insights"] as const;

export default function ClassScreen() {
  const { classId, tab: initialTab } = useLocalSearchParams<{ classId: string; tab?: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]>(
    (TABS as readonly string[]).includes(initialTab ?? "") ? (initialTab as (typeof TABS)[number]) : "Sessions",
  );
  const qc = useQueryClient();
  const cls = useClass(classId);
  const sessions = useSessions(classId);
  const roster = useRoster(classId);

  if (cls.isLoading) return <Loading />;
  if (!cls.data) return <Screen><Banner tone="bad">Could not load this class.</Banner></Screen>;
  const c = cls.data;

  const refresh = () => qc.invalidateQueries({ queryKey: qk.class(classId) });
  const archive = () =>
    Alert.alert(c.archivedAt ? "Restore class?" : "Archive class?", "Archived classes are hidden from students and lists.", [
      { text: "Cancel", style: "cancel" },
      {
        text: c.archivedAt ? "Restore" : "Archive",
        onPress: async () => {
          await api.patch(`/classes/${classId}`, { archived: !c.archivedAt });
          await qc.invalidateQueries({ queryKey: qk.classes });
          if (!c.archivedAt) router.back();
          else refresh();
        },
      },
    ]);

  return (
    <Screen refreshing={cls.isRefetching} onRefresh={refresh}>
      <Stack.Screen options={{ title: c.code ? `${c.code} · ${c.name}` : c.name }} />
      <Segmented value={tab} options={TABS} onChange={setTab} />
      {tab === "Sessions" ? <SessionsPanel classId={classId} sessions={sessions.data ?? []} /> : null}
      {tab === "Students" ? <StudentsPanel classId={classId} roster={roster.data ?? []} threshold={c.thresholdPct} /> : null}
      {tab === "Insights" ? <InsightsPanel cls={c} /> : null}
      <Button title={c.archivedAt ? "Restore class" : "Archive class"} variant="secondary" onPress={archive} />
    </Screen>
  );
}
