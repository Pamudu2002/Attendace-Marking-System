import { TapEventsBody } from "@attendance/shared";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handler, json, parseBody } from "@/lib/http";
import { tapEventFilter } from "@/lib/telemetry";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batch upload of tap telemetry (experiment data, docs/PLAN.md §8). Idempotent by clientEventId. */
export const POST = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const { events } = await parseBody(req, TapEventsBody);
  const { count } = await prisma.tapEvent.createMany({
    data: events.map((e) => ({
      clientEventId: e.clientEventId,
      teacherId,
      hostModel: e.hostModel,
      purpose: e.purpose,
      contextId: e.contextId ?? null,
      deviceIdHash: e.deviceIdHash ?? null,
      outcome: e.outcome,
      discoveredAt: new Date(e.discoveredAt),
      tSelectMs: e.tSelectMs ?? null,
      tAuthMs: e.tAuthMs ?? null,
      tVerifyMs: e.tVerifyMs ?? null,
      tTotalMs: e.tTotalMs ?? null,
      conditions: (e.conditions ?? undefined) as Prisma.InputJsonValue | undefined,
      errorDetail: e.errorDetail ?? null,
    })),
    skipDuplicates: true,
  });
  return json({ accepted: count, duplicates: events.length - count });
});

export const GET = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 200) || 200, 1000);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const items = await prisma.tapEvent.findMany({
    where: tapEventFilter(teacherId, req.nextUrl.searchParams),
    orderBy: [{ discoveredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = items.slice(0, limit);
  return json({ items: page, nextCursor: items.length > limit ? page[page.length - 1]?.id : null });
});
