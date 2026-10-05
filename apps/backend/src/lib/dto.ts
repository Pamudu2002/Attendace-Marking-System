import type { ClassDto, SessionDto } from "@attendance/shared";
import type { Class, ClassSession } from "@/generated/prisma/client";
import { prisma } from "./db";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function sessionDto(s: ClassSession & { class?: { name: string } }, extra: Partial<SessionDto> = {}): SessionDto {
  return {
    id: s.id,
    classId: s.classId,
    name: s.name,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    cancelledAt: iso(s.cancelledAt),
    ...(s.class ? { className: s.class.name } : {}),
    ...extra,
  };
}

export async function classDtos(classes: Class[]): Promise<ClassDto[]> {
  if (classes.length === 0) return [];
  const ids = classes.map((c) => c.id);
  const now = new Date();
  const [studentCounts, sessionCounts, upcoming] = await Promise.all([
    prisma.enrollment.groupBy({ by: ["classId"], where: { classId: { in: ids }, removedAt: null }, _count: true }),
    prisma.classSession.groupBy({ by: ["classId"], where: { classId: { in: ids }, cancelledAt: null }, _count: true }),
    prisma.classSession.findMany({
      where: { classId: { in: ids }, cancelledAt: null, endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      distinct: ["classId"],
    }),
  ]);
  const sc = new Map(studentCounts.map((r) => [r.classId, r._count]));
  const ss = new Map(sessionCounts.map((r) => [r.classId, r._count]));
  const next = new Map(upcoming.map((s) => [s.classId, s]));
  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    thresholdPct: c.thresholdPct,
    lateAfterMin: c.lateAfterMin,
    checkInOpensBeforeMin: c.checkInOpensBeforeMin,
    archivedAt: iso(c.archivedAt),
    createdAt: c.createdAt.toISOString(),
    studentCount: sc.get(c.id) ?? 0,
    sessionCount: ss.get(c.id) ?? 0,
    nextSession: next.has(c.id) ? sessionDto(next.get(c.id)!) : null,
  }));
}
