import { EnrollBody } from "@attendance/shared";
import { ownedClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { enrollByTap } from "@/lib/enrollment";
import { handler, json, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enrol by tap: name + index typed by the teacher, proof read from the student's phone over NFC. */
export const POST = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const body = await parseBody(req, EnrollBody);
  return json(await enrollByTap(cls, body), 201);
});
