import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import { env } from "./env";

export interface OutgoingPush {
  token: string;
  /** For expo-notifications: title/message are rendered natively, body (JSON) is handed to JS. */
  data: Record<string, string>;
  /** FCM "notification" payload. We send data-only messages instead so the app can ack receipt. */
  notification?: { title: string; body: string };
  channelId?: string;
}

export interface PushResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** Token is permanently invalid and should be cleared. */
  invalidToken?: boolean;
}

let initialised: boolean | null = null;

function ensureFirebase(): boolean {
  if (initialised !== null) return initialised;
  const json = env.firebaseServiceAccount;
  if (!json) {
    console.warn("[push] FIREBASE_SERVICE_ACCOUNT_JSON not set: pushes are logged, not sent");
    return (initialised = false);
  }
  if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(json)) });
  return (initialised = true);
}

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Sends one FCM message per entry (each has its own data, e.g. a notificationId to ack). */
export async function sendPushes(pushes: OutgoingPush[]): Promise<PushResult[]> {
  if (pushes.length === 0) return [];
  if (!ensureFirebase()) {
    for (const p of pushes) console.info("[push:dry-run]", p.notification?.title ?? "(data)", p.data);
    return pushes.map((_, i) => ({ ok: true, messageId: `dry-run-${Date.now()}-${i}` }));
  }
  const messages: Message[] = pushes.map((p) => ({
    token: p.token,
    data: p.data,
    notification: p.notification,
    android: {
      priority: "high",
      ...(p.notification ? { notification: { channelId: p.channelId ?? "reminders" } } : {}),
    },
  }));
  const results: PushResult[] = [];
  // FCM accepts up to 500 messages per sendEach call.
  for (let i = 0; i < messages.length; i += 500) {
    const batch = await getMessaging().sendEach(messages.slice(i, i + 500));
    for (const r of batch.responses) {
      results.push(
        r.success
          ? { ok: true, messageId: r.messageId }
          : { ok: false, error: r.error?.code ?? "unknown", invalidToken: INVALID_TOKEN_CODES.has(r.error?.code ?? "") },
      );
    }
  }
  return results;
}
