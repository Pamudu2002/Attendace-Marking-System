import { ClassCreateBody } from "@attendance/shared";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { classDtos } from "@/lib/dto";
import { handler, json, parseBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const archived = req.nextUrl.searchParams.get("archived") === "true";
  const classes = await prisma.class.findMany({
    where: { teacherId, archivedAt: archived ? { not: null } : null },
    orderBy: { createdAt: "desc" },
  });
  return json({ items: await classDtos(classes) });
});

export const POST = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const body = await parseBody(req, ClassCreateBody);
  const cls = await prisma.class.create({ data: { ...body, code: body.code || null, teacherId } });
  const [dto] = await classDtos([cls]);
  return json(dto, 201);
});
