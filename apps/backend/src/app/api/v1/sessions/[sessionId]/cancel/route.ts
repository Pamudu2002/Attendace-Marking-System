import { ownedSession } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { handler, json } from "@/lib/http";
import { enqueuePush, scheduleSessionReminder } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler<{ sessionId: string }>(async (req, { sessionId }) => {
  const { teacherId } = await requireTeacher(req);
  const s = await ownedSession(teacherId, sessionId);
  if (s.cancelledAt) return json(sessionDto(s));
  const updated = await prisma.classSession.update({ where: { id: s.id }, data: { cancelledAt: new Date() } });
  await scheduleSessionReminder(s.id); // cancels the pending reminder
  if (s.endsAt > new Date()) await enqueuePush({ type: "SESSION_CANCELLED", sessionId: s.id });
  return json(sessionDto(updated));
});
