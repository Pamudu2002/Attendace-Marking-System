import { SessionUpdateBody } from "@attendance/shared";
import { ownedSession } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { ApiError, handler, json, noContent, parseBody } from "@/lib/http";
import { enqueuePush, getPublisher, REMINDER_QUEUE, scheduleSessionReminder } from "@/lib/jobs";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { sessionId: string };

export const GET = handler<P>(async (req, { sessionId }) => {
  const { teacherId } = await requireTeacher(req);
  const s = await ownedSession(teacherId, sessionId);
  const [presentCount, enrolledCount] = await Promise.all([
    prisma.attendanceRecord.count({ where: { sessionId: s.id } }),
    prisma.enrollment.count({ where: { classId: s.classId, removedAt: null } }),
  ]);
  return json({
    ...sessionDto(s, { presentCount, enrolledCount }),
    class: {
      id: s.class.id,
      name: s.class.name,
      code: s.class.code,
      lateAfterMin: s.class.lateAfterMin,
      checkInOpensBeforeMin: s.class.checkInOpensBeforeMin,
    },
  });
});

export const PATCH = handler<P>(async (req, { sessionId }) => {
  const { teacherId } = await requireTeacher(req);
  const s = await ownedSession(teacherId, sessionId);
  if (s.cancelledAt) throw new ApiError(409, "SESSION_CANCELLED", "Session is cancelled");
  const body = await parseBody(req, SessionUpdateBody);
  const startsAt = body.startsAt ? new Date(body.startsAt) : s.startsAt;
  const endsAt = body.endsAt ? new Date(body.endsAt) : s.endsAt;
  if (endsAt <= startsAt) throw new ApiError(422, "INVALID_TIME_RANGE", "endsAt must be after startsAt");
  const updated = await prisma.classSession.update({
    where: { id: s.id },
    data: { name: body.name, startsAt, endsAt },
  });
  const timeChanged = startsAt.getTime() !== s.startsAt.getTime() || endsAt.getTime() !== s.endsAt.getTime();
  if (timeChanged) await scheduleSessionReminder(s.id);
  if ((timeChanged || (body.name && body.name !== s.name)) && endsAt > new Date()) {
    await enqueuePush({ type: "SESSION_CHANGED", sessionId: s.id });
  }
  return json(sessionDto(updated));
});

export const DELETE = handler<P>(async (req, { sessionId }) => {
  const { teacherId } = await requireTeacher(req);
  const s = await ownedSession(teacherId, sessionId);
  if (await prisma.attendanceRecord.count({ where: { sessionId: s.id } })) {
    throw new ApiError(409, "HAS_ATTENDANCE", "Session has attendance records; cancel it instead");
  }
  if (s.reminderJobId && !env.jobsDisabled) {
    await (await getPublisher()).cancel(REMINDER_QUEUE, s.reminderJobId).catch(() => undefined);
  }
  await prisma.classSession.delete({ where: { id: s.id } });
  return noContent();
});
