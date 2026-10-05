import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return json({ status: "ok", db: "ok", time: new Date().toISOString() });
});
