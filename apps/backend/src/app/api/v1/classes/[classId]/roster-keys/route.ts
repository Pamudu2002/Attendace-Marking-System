import type { RosterKeyDto } from "@attendance/shared";
import { ownedClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { b64url, sha256Hex } from "@/lib/crypto";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public keys of enrolled students' active phones, cached by the host app for offline check-in. */
export const GET = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: cls.id, removedAt: null },
    include: { student: { include: { devices: { where: { status: "ACTIVE" } } } } },
    orderBy: { student: { indexNumber: "asc" } },
  });
  const items: RosterKeyDto[] = enrollments.flatMap((e) =>
    e.student.devices.map((d) => ({
      studentId: e.studentId,
      indexNumber: e.student.indexNumber,
      fullName: e.student.fullName,
      deviceId: d.id,
      publicKey: b64url.encode(d.publicKey),
    })),
  );
  const version = sha256Hex(JSON.stringify(items)).slice(0, 16);
  const etag = `"${version}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return json({ version, items }, 200, { etag });
});
