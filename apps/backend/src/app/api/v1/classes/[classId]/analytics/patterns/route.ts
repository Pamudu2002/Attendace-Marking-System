import { ownedClass } from "@/lib/access";
import { patterns } from "@/lib/analytics";
import { requireTeacher } from "@/lib/auth";
import { ApiError, handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?tz=Asia/Colombo groups sessions by the viewer's local weekday/hour (default UTC). */
export const GET = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const tz = req.nextUrl.searchParams.get("tz") || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Unknown time zone");
  }
  return json(await patterns(cls.id, tz));
});
