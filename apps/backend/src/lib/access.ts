import { prisma } from "./db";
import { forbidden, notFound, parseUuid } from "./http";

export async function ownedClass(teacherId: string, classId: string) {
  const cls = await prisma.class.findUnique({ where: { id: parseUuid(classId, "Class") } });
  if (!cls) throw notFound("Class");
  if (cls.teacherId !== teacherId) throw forbidden();
  return cls;
}

export async function ownedSession(teacherId: string, sessionId: string) {
  const session = await prisma.classSession.findUnique({
    where: { id: parseUuid(sessionId, "Session") },
    include: { class: true },
  });
  if (!session) throw notFound("Session");
  if (session.class.teacherId !== teacherId) throw forbidden();
  return session;
}
