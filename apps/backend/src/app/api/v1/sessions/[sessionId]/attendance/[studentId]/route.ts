import { ManualAttendanceBody } from "@attendance/shared";
import { ownedSession } from "@/lib/access";
import { setManualAttendance } from "@/lib/attendance";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json, noContent, notFound, parseBody, parseUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { sessionId: string; studentId: string };

/** Manual override (excused, forgot phone, ...). Stored with source = MANUAL. */
export const PUT = handler<P>(async (req, { sessionId, studentId }) => {
  const { teacherId } = await requireTeacher(req);
  const session = await ownedSession(teacherId, sessionId);
  const body = await parseBody(req, ManualAttendanceBody);
  const r = await setManualAttendance(session, parseUuid(studentId, "Student"), teacherId, body);
  return json({
    studentId: r.studentId,
    status: r.status,
    source: r.source,
    tappedAt: r.tappedAt.toISOString(),
    note: r.note,
  });
});

export const DELETE = handler<P>(async (req, { sessionId, studentId }) => {
  const { teacherId } = await requireTeacher(req);
  const session = await ownedSession(teacherId, sessionId);
  const { count } = await prisma.attendanceRecord.deleteMany({
    where: { sessionId: session.id, studentId: parseUuid(studentId, "Student") },
  });
  if (count === 0) throw notFound("Attendance record");
  return noContent();
});
