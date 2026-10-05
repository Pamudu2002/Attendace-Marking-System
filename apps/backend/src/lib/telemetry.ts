import type { Prisma } from "@/generated/prisma/client";

/** Filters for tap telemetry: ?runId=&from=&to= (runId matches conditions.runId). */
export function tapEventFilter(teacherId: string, params: URLSearchParams): Prisma.TapEventWhereInput {
  const runId = params.get("runId");
  const from = params.get("from");
  const to = params.get("to");
  return {
    teacherId,
    ...(runId ? { conditions: { path: ["runId"], equals: runId } } : {}),
    ...(from || to
      ? { discoveredAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };
}
