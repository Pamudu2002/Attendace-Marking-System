import { TeacherLoginBody } from "@attendance/shared";
import { issueTokens, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, clientIp, handler, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const body = await parseBody(req, TeacherLoginBody);
  rateLimit(`login:${body.email}:${clientIp(req)}`, 5, 15 * 60_000);
  const teacher = await prisma.teacher.findUnique({ where: { email: body.email } });
  const ok = await verifyPassword(teacher?.passwordHash ?? null, body.password);
  if (!teacher || !ok) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  const tokens = await issueTokens("TEACHER", teacher.id);
  return json({ teacher: { id: teacher.id, email: teacher.email, fullName: teacher.fullName }, ...tokens });
});
