import type { StudentClassDetailDto } from "@attendance/shared";
import { studentRows } from "@/lib/analytics";
import { requireStudentDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json, notFound, parseUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler<{ classId: string }>(async (req, { classId }) => {
  const { studentId } = await requireStudentDevice(req);
  if (!studentId) throw notFound("Class");
  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: parseUuid(classId, "Class"), studentId } },
    include: { class: { include: { teacher: { select: { fullName: true } } } } },
  });
  if (!enrollment || enrollment.removedAt) throw notFound("Class");
  const c = enrollment.class;
  const enrolledDay = new Date(enrollment.enrolledAt);
  enrolledDay.setUTCHours(0, 0, 0, 0);
  const [[row], sessions] = await Promise.all([
    studentRows(c, studentId),
    prisma.classSession.findMany({
      where: { classId: c.id, startsAt: { gte: enrolledDay } },
      orderBy: { startsAt: "desc" },
      include: { attendance: { where: { studentId }, select: { status: true } } },
    }),
  ]);
  const now = new Date();
  const body: StudentClassDetailDto = {
    class: { id: c.id, name: c.name, code: c.code, teacherName: c.teacher.fullName, thresholdPct: c.thresholdPct },
    attendancePct: row?.pct ?? null,
    maxAchievablePct: row?.maxAchievablePct ?? null,
    sessionsNeeded: row?.sessionsNeeded ?? null,
    history: sessions.map((s) => ({
      sessionId: s.id,
      name: s.name,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.cancelledAt
        ? "CANCELLED"
        : (s.attendance[0]?.status ?? (s.endsAt < now ? "ABSENT" : "UPCOMING")),
    })),
  };
  return json(body);
});
