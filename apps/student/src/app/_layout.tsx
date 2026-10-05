import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Banner, Body, Button, errorMessage, Field, H1, Loading, Screen, usePalette } from "@attendance/mobile-core";
import { Hce } from "../../modules/attendance-hce";
import { getApiUrl, setApiUrl } from "@/lib/config";
import { AppContext } from "@/lib/context";
import { bootstrapIdentity, type IdentityState } from "@/lib/identity";
import { ackNotification, parsePayload, registerPushToken, setupPush, type PushSetupResult } from "@/lib/push";
import { qk } from "@/lib/queries";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

type Phase = { kind: "loading" } | { kind: "ready"; identity: IdentityState } | { kind: "error"; message: string };

export default function RootLayout() {
  const c = usePalette();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [push, setPush] = useState<PushSetupResult | null>(null);

  const start = useCallback(() => {
    setPhase({ kind: "loading" });
    bootstrapIdentity()
      .then((identity) => {
        setPhase({ kind: "ready", identity });
        setupPush().then(setPush).catch(() => setPush(null));
      })
      .catch((e) => setPhase({ kind: "error", message: errorMessage(e) }));
  }, []);

  useEffect(start, [start]);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    const subs = [
      Notifications.addPushTokenListener((t) => {
        if (typeof t.data === "string") registerPushToken(t.data).catch(() => undefined);
      }),
      Notifications.addNotificationReceivedListener((n) => {
        const p = parsePayload(n.request.content.data);
        if (p?.type === "DEVICE_REVOKED") start();
        queryClient.invalidateQueries();
      }),
      Notifications.addNotificationResponseReceivedListener((r) => {
        const p = parsePayload(r.notification.request.content.data);
        if (p?.notificationId) {
          const now = new Date();
          ackNotification(p.notificationId, { receivedAt: now, openedAt: now });
        }
        if (p?.classId) router.push(`/class/${p.classId}`);
      }),
      // Live feedback from the HCE service when the lecturer's phone confirms a tap.
      Hce.addTapListener(() => {
        queryClient.invalidateQueries({ queryKey: qk.sessions });
        queryClient.invalidateQueries({ queryKey: qk.classes });
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [phase.kind, start]);

  if (phase.kind === "loading") return <Loading />;
  if (phase.kind === "error") return <StartupError message={phase.message} onRetry={start} />;

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={{ identity: phase.identity, push, reload: start }}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.card },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="class/[classId]" options={{ title: "Class" }} />
        </Stack>
      </AppContext.Provider>
    </QueryClientProvider>
  );
}

function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    getApiUrl().then(setUrl);
  }, []);
  return (
    <Screen>
      <H1>Can't start</H1>
      <Banner tone="bad">{message}</Banner>
      <Body muted>
        The app needs the attendance server once to register this phone. Make sure the server URL is reachable from
        the phone (same Wi-Fi, or a tunnel URL).
      </Body>
      <Field label="Server URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
      <Button
        title="Save and retry"
        onPress={async () => {
          await setApiUrl(url || null);
          onRetry();
        }}
      />
    </Screen>
  );
}
