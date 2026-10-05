import { TeacherUpdateBody } from "@attendance/shared";
import { hashPassword, requireTeacher, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, handler, json, notFound, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const t = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!t) throw notFound("Teacher");
  return json({ id: t.id, email: t.email, fullName: t.fullName });
});

export const PATCH = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const body = await parseBody(req, TeacherUpdateBody);
  const t = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!t) throw notFound("Teacher");
  let passwordHash: string | undefined;
  if (body.newPassword) {
    if (!(await verifyPassword(t.passwordHash, body.currentPassword ?? ""))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
    }
    passwordHash = await hashPassword(body.newPassword);
  }
  const updated = await prisma.teacher.update({
    where: { id: teacherId },
    data: { fullName: body.fullName, passwordHash },
  });
  return json({ id: updated.id, email: updated.email, fullName: updated.fullName });
});
