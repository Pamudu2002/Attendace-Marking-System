import type { StudentMeDto } from "@attendance/shared";
import { requireStudentDevice } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const { deviceId, studentId } = await requireStudentDevice(req);
  const student = studentId ? await prisma.student.findUnique({ where: { id: studentId } }) : null;
  const body: StudentMeDto = {
    deviceId,
    bound: !!student,
    student: student ? { id: student.id, indexNumber: student.indexNumber, fullName: student.fullName } : null,
  };
  return json(body);
});
