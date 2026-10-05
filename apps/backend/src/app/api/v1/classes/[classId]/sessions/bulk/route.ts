import { SessionBulkBody } from "@attendance/shared";
import { ownedClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionDto } from "@/lib/dto";
import { ApiError, handler, json, parseBody } from "@/lib/http";
import { scheduleSessionReminder } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86_400_000;
const MAX_SESSIONS = 60;

/** Creates a weekly series: "Lecture" every week from startsAt until repeat.until. Names get a running number. */
export const POST = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  if (cls.archivedAt) throw new ApiError(409, "CLASS_ARCHIVED", "Class is archived");
  const body = await parseBody(req, SessionBulkBody);
  const start = new Date(body.startsAt).getTime();
  const duration = new Date(body.endsAt).getTime() - start;
  const until = new Date(body.repeat.until).getTime();
  const data = [];
  for (let t = start, i = 1; t <= until; t += WEEK_MS, i++) {
    if (data.length >= MAX_SESSIONS) throw new ApiError(422, "TOO_MANY_SESSIONS", `At most ${MAX_SESSIONS} sessions per series`);
    data.push({ classId: cls.id, name: `${body.name} ${i}`, startsAt: new Date(t), endsAt: new Date(t + duration) });
  }
  if (data.length === 0) throw new ApiError(422, "INVALID_TIME_RANGE", "repeat.until is before startsAt");
  const sessions = await prisma.classSession.createManyAndReturn({ data });
  for (const s of sessions) await scheduleSessionReminder(s.id);
  return json({ items: sessions.map((s) => sessionDto(s)) }, 201);
});
