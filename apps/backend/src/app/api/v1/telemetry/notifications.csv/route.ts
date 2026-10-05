import { requireTeacher } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { hashDeviceId } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { handler } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reminder delivery delay (optional experiment): scheduled vs sent vs received on the phone. */
export const GET = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const logs = await prisma.notificationLog.findMany({
    where: { session: { class: { teacherId } } },
    include: { device: { select: { model: true, manufacturer: true, androidVersion: true } } },
    orderBy: { scheduledFor: "asc" },
  });
  const header = [
    "notification_id", "kind", "session_id", "device_hash", "device_model", "android_version",
    "scheduled_for", "sent_at", "received_at", "opened_at", "send_delay_ms", "delivery_delay_ms", "error",
  ];
  const rows = logs.map((n) => [
    n.id, n.kind, n.sessionId, hashDeviceId(n.deviceId),
    [n.device.manufacturer, n.device.model].filter(Boolean).join(" "), n.device.androidVersion,
    n.scheduledFor, n.sentAt, n.receivedAt, n.openedAt,
    n.sentAt ? n.sentAt.getTime() - n.scheduledFor.getTime() : null,
    n.sentAt && n.receivedAt ? n.receivedAt.getTime() - n.sentAt.getTime() : null,
    n.error,
  ]);
  return csvResponse("notifications.csv", toCsv(header, rows));
});
