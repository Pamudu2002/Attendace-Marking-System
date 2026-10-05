import { TeacherRegisterBody } from "@attendance/shared";
import { hashPassword, issueTokens } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, clientIp, handler, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);
  const body = await parseBody(req, TeacherRegisterBody);
  if (await prisma.teacher.findUnique({ where: { email: body.email } })) {
    throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
  }
  const teacher = await prisma.teacher.create({
    data: { email: body.email, fullName: body.fullName, passwordHash: await hashPassword(body.password) },
  });
  const tokens = await issueTokens("TEACHER", teacher.id);
  return json({ teacher: { id: teacher.id, email: teacher.email, fullName: teacher.fullName }, ...tokens }, 201);
});
