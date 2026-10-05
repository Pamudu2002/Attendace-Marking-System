import type { StudentClassDto } from "@attendance/shared";
import { studentRows } from "@/lib/analytics";
import { requireStudentDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const { studentId } = await requireStudentDevice(req);
  if (!studentId) return json({ items: [] });
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, removedAt: null, class: { archivedAt: null } },
    include: { class: { include: { teacher: { select: { fullName: true } } } } },
    orderBy: { class: { name: "asc" } },
  });
  const now = new Date();
  const items: StudentClassDto[] = await Promise.all(
    enrollments.map(async ({ class: c }) => {
      const [[row], next] = await Promise.all([
        studentRows(c, studentId),
        prisma.classSession.findFirst({
          where: { classId: c.id, cancelledAt: null, endsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
        }),
      ]);
      return {
        classId: c.id,
        name: c.name,
        code: c.code,
        teacherName: c.teacher.fullName,
        thresholdPct: c.thresholdPct,
        attendancePct: row?.pct ?? null,
        nextSession: next ? sessionDto(next) : null,
      };
    }),
  );
  return json({ items });
});
