import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { ackNotification, parsePayload } from "./push";

/**
 * Runs for every incoming push (foreground, background and, for data-only messages, when the app is killed).
 * The OS already shows the reminder; here we only record when it arrived on the phone.
 */
export const BACKGROUND_NOTIFICATION_TASK = "attendance-background-notification";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error || !data || "actionIdentifier" in data) return Notifications.BackgroundNotificationTaskResult.NoData;
  const payload = parsePayload(data.data) ?? parsePayload(data);
  if (payload?.notificationId) await ackNotification(payload.notificationId, { receivedAt: new Date() });
  return Notifications.BackgroundNotificationTaskResult.NewData;
});

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => undefined);
