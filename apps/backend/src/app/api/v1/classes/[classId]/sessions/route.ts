import { RangeQuery, SessionCreateBody } from "@attendance/shared";
import { ownedClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { ApiError, handler, json, parseBody, parseQuery } from "@/lib/http";
import { scheduleSessionReminder } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { classId: string };

export const GET = handler<P>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const { from, to } = parseQuery(req, RangeQuery);
  const [sessions, enrolledCount] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        classId: cls.id,
        ...(from ? { endsAt: { gte: new Date(from) } } : {}),
        ...(to ? { startsAt: { lte: new Date(to) } } : {}),
      },
      orderBy: { startsAt: "asc" },
      include: { _count: { select: { attendance: true } } },
    }),
    prisma.enrollment.count({ where: { classId: cls.id, removedAt: null } }),
  ]);
  return json({
    items: sessions.map((s) => sessionDto(s, { presentCount: s._count.attendance, enrolledCount })),
  });
});

export const POST = handler<P>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  if (cls.archivedAt) throw new ApiError(409, "CLASS_ARCHIVED", "Class is archived");
  const body = await parseBody(req, SessionCreateBody);
  const session = await prisma.classSession.create({
    data: { classId: cls.id, name: body.name, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) },
  });
  await scheduleSessionReminder(session.id);
  return json(sessionDto(session), 201);
});
