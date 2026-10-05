import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import type { PushType } from "@attendance/shared";
import { api } from "./api";

export interface PushPayload {
  type: PushType;
  sessionId?: string;
  classId?: string;
  notificationId?: string;
}

// Show reminders even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Backend sends data-only FCM messages; the payload is JSON in `body` (see apps/backend/src/lib/notifications.ts). */
export function parsePayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const candidate of [d.body, d.dataString]) {
    if (typeof candidate === "string") {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && "type" in parsed) return parsed as PushPayload;
        const nested = parsePayload(parsed);
        if (nested) return nested;
      } catch {
        // not JSON
      }
    }
  }
  if (typeof d.type === "string") return d as unknown as PushPayload;
  if (d.data && typeof d.data === "object") return parsePayload(d.data);
  return null;
}

/** Records receipt/open time for the reminder delivery-delay measurement (best effort). */
export async function ackNotification(notificationId: string, fields: { receivedAt: Date; openedAt?: Date }) {
  try {
    await api.post(`/student/notifications/${notificationId}/ack`, {
      receivedAt: fields.receivedAt.toISOString(),
      ...(fields.openedAt ? { openedAt: fields.openedAt.toISOString() } : {}),
    });
  } catch {
    // Offline or not logged in yet; delay data for this one is simply missing.
  }
}

export async function registerPushToken(token: string) {
  await api.put("/student/device", { fcmToken: token, androidVersion: Device.osVersion ?? undefined });
}

export type PushSetupResult = { granted: boolean; token: string | null; error?: string };

export async function setupPush(): Promise<PushSetupResult> {
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Class reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return { granted: false, token: null };
  try {
    // The native FCM registration token (our backend talks to FCM directly).
    const token = await Notifications.getDevicePushTokenAsync();
    const value = typeof token.data === "string" ? token.data : JSON.stringify(token.data);
    await registerPushToken(value);
    return { granted: true, token: value };
  } catch (e) {
    // Typically: google-services.json missing from the build, so FCM is unavailable.
    return { granted: true, token: null, error: e instanceof Error ? e.message : String(e) };
  }
}
