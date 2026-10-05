import type { RosterStudentDto } from "@attendance/shared";
import { ownedClass } from "@/lib/access";
import { studentRows } from "@/lib/analytics";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const [enrollments, stats] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId: cls.id, removedAt: null },
      include: { student: { include: { devices: { where: { status: "ACTIVE" }, take: 1 } } } },
      orderBy: { student: { indexNumber: "asc" } },
    }),
    studentRows(cls),
  ]);
  const pct = new Map(stats.map((s) => [s.studentId, s.pct]));
  const items: RosterStudentDto[] = enrollments.map((e) => {
    const d = e.student.devices[0];
    return {
      studentId: e.studentId,
      indexNumber: e.student.indexNumber,
      fullName: e.student.fullName,
      enrolledAt: e.enrolledAt.toISOString(),
      device: d ? { id: d.id, model: d.model, status: d.status } : null,
      attendancePct: pct.get(e.studentId) ?? null,
    };
  });
  return json({ items });
});
