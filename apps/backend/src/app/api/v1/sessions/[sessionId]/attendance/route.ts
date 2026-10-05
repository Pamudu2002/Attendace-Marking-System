import type { SessionAttendanceDto } from "@attendance/shared";
import { ownedSession } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler<{ sessionId: string }>(async (req, { sessionId }) => {
  const { teacherId } = await requireTeacher(req);
  const s = await ownedSession(teacherId, sessionId);
  const [enrollments, records] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId: s.classId, removedAt: null },
      include: { student: true },
      orderBy: { student: { indexNumber: "asc" } },
    }),
    prisma.attendanceRecord.findMany({ where: { sessionId: s.id } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const body: SessionAttendanceDto = {
    session: sessionDto(s, { presentCount: records.length, enrolledCount: enrollments.length }),
    items: enrollments.map((e) => {
      const r = byStudent.get(e.studentId);
      return {
        studentId: e.studentId,
        indexNumber: e.student.indexNumber,
        fullName: e.student.fullName,
        status: r?.status ?? "ABSENT",
        tappedAt: r?.tappedAt.toISOString() ?? null,
        source: r?.source ?? null,
      };
    }),
  };
  return json(body);
});
