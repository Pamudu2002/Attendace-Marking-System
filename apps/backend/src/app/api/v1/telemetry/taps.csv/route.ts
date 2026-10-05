import { requireTeacher } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { handler } from "@/lib/http";
import { tapEventFilter } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONDITION_KEYS = ["runId", "studentPhone", "screenState", "appState", "case", "orientation", "notes"];

/** Raw tap telemetry for the data package. Device ids are already hashed by the host app. */
export const GET = handler(async (req) => {
  const { teacherId } = await requireTeacher(req);
  const events = await prisma.tapEvent.findMany({
    where: tapEventFilter(teacherId, req.nextUrl.searchParams),
    orderBy: { discoveredAt: "asc" },
  });
  const header = [
    "event_id", "discovered_at", "host_model", "purpose", "context_id", "device_hash", "outcome",
    "t_select_ms", "t_auth_ms", "t_verify_ms", "t_total_ms", ...CONDITION_KEYS, "error_detail",
  ];
  const rows = events.map((e) => {
    const c = (e.conditions ?? {}) as Record<string, unknown>;
    return [
      e.clientEventId, e.discoveredAt, e.hostModel, e.purpose, e.contextId, e.deviceIdHash, e.outcome,
      e.tSelectMs, e.tAuthMs, e.tVerifyMs, e.tTotalMs,
      ...CONDITION_KEYS.map((k) => (c[k] === undefined ? null : String(c[k]))),
      e.errorDetail,
    ];
  });
  return csvResponse("tap_events.csv", toCsv(header, rows));
});
