import { StudentDeviceUpdateBody } from "@attendance/shared";
import { requireStudentDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, noContent, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called on app launch and whenever FCM rotates the token. */
export const PUT = handler(async (req) => {
  const { deviceId } = await requireStudentDevice(req);
  const body = await parseBody(req, StudentDeviceUpdateBody);
  if (body.fcmToken) {
    // A token belongs to one install; drop it from any stale device rows.
    await prisma.studentDevice.updateMany({
      where: { fcmToken: body.fcmToken, id: { not: deviceId } },
      data: { fcmToken: null },
    });
  }
  await prisma.studentDevice.update({
    where: { id: deviceId },
    data: {
      ...(body.fcmToken !== undefined ? { fcmToken: body.fcmToken } : {}),
      appVersion: body.appVersion,
      androidVersion: body.androidVersion,
      lastSeenAt: new Date(),
    },
  });
  return noContent();
});
