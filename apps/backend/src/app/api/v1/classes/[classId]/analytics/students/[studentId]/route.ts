import { ownedClass } from "@/lib/access";
import { studentDetail } from "@/lib/analytics";
import { requireTeacher } from "@/lib/auth";
import { handler, json, notFound, parseUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler<{ classId: string; studentId: string }>(async (req, { classId, studentId }) => {
  const { teacherId } = await requireTeacher(req);
  const detail = await studentDetail(await ownedClass(teacherId, classId), parseUuid(studentId, "Student"));
  if (!detail) throw notFound("Student");
  return json(detail);
});
