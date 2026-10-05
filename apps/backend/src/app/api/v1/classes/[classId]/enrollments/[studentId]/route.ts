import { ownedClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, noContent, notFound, parseUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = handler<{ classId: string; studentId: string }>(async (req, { classId, studentId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const { count } = await prisma.enrollment.updateMany({
    where: { classId: cls.id, studentId: parseUuid(studentId, "Student"), removedAt: null },
    data: { removedAt: new Date() },
  });
  if (count === 0) throw notFound("Enrolment");
  return noContent();
});
