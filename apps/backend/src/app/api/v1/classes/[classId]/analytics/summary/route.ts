import { ownedClass } from "@/lib/access";
import { summary } from "@/lib/analytics";
import { requireTeacher } from "@/lib/auth";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  return json(await summary(await ownedClass(teacherId, classId)));
});
