import { prisma } from "./db";
import { sendPushes, type OutgoingPush } from "./push";
import { REMINDER_LEAD_MS, type PushJob } from "./jobs";

type SessionKind = "REMINDER_30" | "SESSION_CHANGED" | "SESSION_CANCELLED";

function formatTime(d: Date) {
  // Phones render their own local time from data.startsAt; this is only the fallback text.
  return d.toISOString().slice(11, 16) + " UTC";
}

async function activeDevicesForClass(classId: string) {
  return prisma.studentDevice.findMany({
    where: {
      status: "ACTIVE",
      fcmToken: { not: null },
      student: { enrollments: { some: { classId, removedAt: null } } },
    },
    select: { id: true, fcmToken: true },
  });
}

async function clearInvalidTokens(deviceIds: string[]) {
  if (deviceIds.length) {
    await prisma.studentDevice.updateMany({ where: { id: { in: deviceIds } }, data: { fcmToken: null } });
  }
}

/** Sends a session-related push to every enrolled device, logging each one in notification_log. */
export async function notifySession(sessionId: string, kind: SessionKind): Promise<number> {
  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { class: true } });
  if (!session) return 0;
  if (kind === "REMINDER_30" && (session.cancelledAt || session.startsAt.getTime() < Date.now())) return 0;

  let devices = await activeDevicesForClass(session.classId);
  if (kind === "REMINDER_30") {
    // Idempotent: skip devices that already got this reminder (job retry or sweep overlap).
    const already = await prisma.notificationLog.findMany({
      where: { sessionId, kind, sentAt: { not: null } },
      select: { deviceId: true },
    });
    const done = new Set(already.map((n) => n.deviceId));
    devices = devices.filter((d) => !done.has(d.id));
  }
  if (devices.length === 0) return 0;

  const scheduledFor =
    kind === "REMINDER_30" ? new Date(session.startsAt.getTime() - REMINDER_LEAD_MS) : new Date();
  const logs = await prisma.notificationLog.createManyAndReturn({
    data: devices.map((d) => ({ sessionId, deviceId: d.id, kind, scheduledFor })),
    select: { id: true, deviceId: true },
  });
  const logByDevice = new Map(logs.map((l) => [l.deviceId, l.id]));

  const cls = session.class.code ? `${session.class.code} ${session.name}` : `${session.class.name}: ${session.name}`;
  const text = {
    REMINDER_30: { title: `${cls} starts in 30 minutes`, body: `Starts at ${formatTime(session.startsAt)}. Tap your lecturer's phone to check in.` },
    SESSION_CHANGED: { title: `${cls} was updated`, body: `Now ${formatTime(session.startsAt)}–${formatTime(session.endsAt)}.` },
    SESSION_CANCELLED: { title: `${cls} was cancelled`, body: `No check-in needed for this session.` },
  }[kind];
  const type = kind === "REMINDER_30" ? "SESSION_REMINDER" : kind;

  // Data-only + high priority: expo-notifications on the phone renders title/message itself and also
  // runs the app's background task, which acks receipt time (reminder delay experiment).
  const pushes: OutgoingPush[] = devices.map((d) => {
    const payload = {
      type,
      sessionId,
      classId: session.classId,
      notificationId: logByDevice.get(d.id)!,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      sessionName: session.name,
      className: session.class.name,
    };
    return {
      token: d.fcmToken!,
      data: { ...payload, title: text.title, message: text.body, channelId: "reminders", body: JSON.stringify(payload) },
    };
  });
  const results = await sendPushes(pushes);
  const sentAt = new Date();
  await Promise.all(
    devices.map((d, i) =>
      prisma.notificationLog.update({
        where: { id: logByDevice.get(d.id)! },
        data: results[i]?.ok ? { sentAt, fcmMessageId: results[i]?.messageId } : { error: results[i]?.error ?? "unknown" },
      }),
    ),
  );
  await clearInvalidTokens(devices.filter((_, i) => results[i]?.invalidToken).map((d) => d.id));
  return results.filter((r) => r.ok).length;
}

async function notifyDevice(deviceId: string, data: Record<string, string>) {
  const device = await prisma.studentDevice.findUnique({ where: { id: deviceId }, select: { fcmToken: true } });
  if (!device?.fcmToken) return;
  // Silent (no title/message): expo-notifications passes it to JS only, as data.body.
  const [r] = await sendPushes([{ token: device.fcmToken, data: { ...data, body: JSON.stringify(data) } }]);
  if (r?.invalidToken) await clearInvalidTokens([deviceId]);
}

export async function handlePushJob(job: PushJob): Promise<void> {
  switch (job.type) {
    case "SESSION_CHANGED":
    case "SESSION_CANCELLED":
      await notifySession(job.sessionId, job.type);
      return;
    case "ENROLLED":
      await notifyDevice(job.deviceId, { type: "ENROLLED", classId: job.classId });
      return;
    case "DEVICE_REVOKED":
      await notifyDevice(job.deviceId, { type: "DEVICE_REVOKED" });
      return;
  }
}

/**
 * Safety net run by the worker every few minutes: sends reminders for sessions starting within
 * the next 30 minutes that have none yet (e.g. created while the worker was down).
 */
export async function sweepMissedReminders(): Promise<number> {
  const now = new Date();
  const sessions = await prisma.classSession.findMany({
    where: {
      cancelledAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_MS) },
      notifications: { none: { kind: "REMINDER_30" } },
    },
    select: { id: true },
  });
  let sent = 0;
  for (const s of sessions) sent += await notifySession(s.id, "REMINDER_30");
  return sent;
}
