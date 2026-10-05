import { AttendanceBatchBody } from "@attendance/shared";
import { ownedSession } from "@/lib/access";
import { ingestBatch } from "@/lib/attendance";
import { requireTeacher } from "@/lib/auth";
import { handler, json, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler<{ sessionId: string }>(async (req, { sessionId }) => {
  const { teacherId } = await requireTeacher(req);
  const session = await ownedSession(teacherId, sessionId);
  const body = await parseBody(req, AttendanceBatchBody);
  return json(await ingestBatch(session, teacherId, body));
});
