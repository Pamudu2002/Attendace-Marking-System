import { RangeQuery } from "@attendance/shared";
import { requireStudentDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { handler, json, parseQuery } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upcoming sessions across all enrolled classes (default: now → +30 days). */
export const GET = handler(async (req) => {
  const { studentId } = await requireStudentDevice(req);
  if (!studentId) return json({ items: [] });
  const q = parseQuery(req, RangeQuery);
  const from = q.from ? new Date(q.from) : new Date();
  const to = q.to ? new Date(q.to) : new Date(Date.now() + 30 * 86_400_000);
  const sessions = await prisma.classSession.findMany({
    where: {
      endsAt: { gte: from },
      startsAt: { lte: to },
      class: { archivedAt: null, enrollments: { some: { studentId, removedAt: null } } },
    },
    include: { class: { select: { name: true } }, attendance: { where: { studentId }, select: { status: true } } },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  return json({
    items: sessions.map((s) => ({ ...sessionDto(s), myStatus: s.attendance[0]?.status ?? null })),
  });
});
