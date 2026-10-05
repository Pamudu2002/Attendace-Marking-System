import { useEffect } from "react";
import { AppState } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Loading, usePalette } from "@attendance/mobile-core";
import { AuthProvider, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { syncAll } from "@/lib/sync";


export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Navigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Navigator() {
  const { teacher, loading } = useAuth();
  const c = usePalette();

  // Upload queued offline check-ins and tap telemetry whenever we're signed in and the app is active.
  useEffect(() => {
    if (!teacher) return;
    syncAll();
    const timer = setInterval(() => syncAll(), 30_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && syncAll());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [teacher]);

  if (loading) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Protected guard={!teacher}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!teacher}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="class/new" options={{ title: "New class", presentation: "modal" }} />
        <Stack.Screen name="class/[classId]/index" options={{ title: "Class" }} />
        <Stack.Screen name="class/[classId]/enroll" options={{ title: "Add student" }} />
        <Stack.Screen name="class/[classId]/session-new" options={{ title: "New session", presentation: "modal" }} />
        <Stack.Screen name="class/[classId]/student/[studentId]" options={{ title: "Student" }} />
        <Stack.Screen name="session/[sessionId]/index" options={{ title: "Session" }} />
        <Stack.Screen name="session/[sessionId]/checkin" options={{ title: "Check-in", headerBackTitle: "Done" }} />
      </Stack.Protected>
    </Stack>
  );
}
