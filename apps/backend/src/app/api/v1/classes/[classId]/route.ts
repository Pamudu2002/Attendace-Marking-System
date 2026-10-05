import { ClassUpdateBody } from "@attendance/shared";
import { ownedClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { classDtos } from "@/lib/dto";
import { ApiError, handler, json, noContent, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { classId: string };

export const GET = handler<P>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const [dto] = await classDtos([await ownedClass(teacherId, classId)]);
  return json(dto);
});

export const PATCH = handler<P>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const { archived, ...rest } = await parseBody(req, ClassUpdateBody);
  const updated = await prisma.class.update({
    where: { id: cls.id },
    data: {
      ...rest,
      ...(archived === undefined ? {} : { archivedAt: archived ? (cls.archivedAt ?? new Date()) : null }),
    },
  });
  const [dto] = await classDtos([updated]);
  return json(dto);
});

export const DELETE = handler<P>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const records = await prisma.attendanceRecord.count({ where: { session: { classId: cls.id } } });
  if (records > 0) throw new ApiError(409, "HAS_ATTENDANCE", "Class has attendance records; archive it instead");
  await prisma.$transaction([
    prisma.enrollment.deleteMany({ where: { classId: cls.id } }),
    prisma.class.delete({ where: { id: cls.id } }),
  ]);
  return noContent();
});
