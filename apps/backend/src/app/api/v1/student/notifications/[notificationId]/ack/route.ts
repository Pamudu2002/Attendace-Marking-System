import { NotificationAckBody } from "@attendance/shared";
import { requireStudentDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, noContent, notFound, parseBody, parseUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Records when the phone received/opened a push, for the reminder delivery-delay measurement. */
export const POST = handler<{ notificationId: string }>(async (req, { notificationId }) => {
  const { deviceId } = await requireStudentDevice(req);
  const body = await parseBody(req, NotificationAckBody);
  const log = await prisma.notificationLog.findFirst({
    where: { id: parseUuid(notificationId, "Notification"), deviceId },
  });
  if (!log) throw notFound("Notification");
  // The first ack wins for receivedAt; a later "opened" ack only adds openedAt.
  await prisma.notificationLog.update({
    where: { id: log.id },
    data: {
      receivedAt: log.receivedAt ?? new Date(body.receivedAt),
      ...(body.openedAt && !log.openedAt ? { openedAt: new Date(body.openedAt) } : {}),
    },
  });
  return noContent();
});
