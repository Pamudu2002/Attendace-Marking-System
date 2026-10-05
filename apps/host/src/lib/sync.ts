import type { BatchResultDto, RosterKeyDto } from "@attendance/shared";
import { ApiError } from "@attendance/mobile-core";
import { api } from "./api";
import {
  getCachedRoster,
  markRecordSynced,
  markTapEventsSynced,
  setCachedRoster,
  unsyncedRecords,
  unsyncedTapEvents,
} from "./db";

/** Uploads verified offline check-ins; the server re-verifies each signature. */
export async function syncAttendance(): Promise<{ accepted: number; rejected: number }> {
  const records = await unsyncedRecords();
  const bySession = new Map<string, typeof records>();
  for (const r of records) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r]);
  let accepted = 0,
    rejected = 0;
  for (const [sessionId, rows] of bySession) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const res = await api.post<BatchResultDto>(`/sessions/${sessionId}/attendance/batch`, {
        records: chunk.map((r) => ({
          clientRecordId: r.client_record_id,
          deviceId: r.device_id,
          status: r.status,
          tappedAt: r.tapped_at,
          proof: { nonce: r.nonce, hostTime: r.host_time, signature: r.signature },
        })),
      });
      for (const result of res.results) {
        await markRecordSynced(result.clientRecordId, result.result, result.reason ?? null);
        if (result.result === "rejected") rejected++;
        else accepted++;
      }
    }
  }
  return { accepted, rejected };
}

export async function syncTapEvents(): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await unsyncedTapEvents(500);
    if (rows.length === 0) return total;
    await api.post("/telemetry/taps", { events: rows.map((r) => JSON.parse(r.payload)) });
    await markTapEventsSynced(rows.map((r) => r.client_event_id));
    total += rows.length;
  }
}

let running: Promise<void> | null = null;

/** Best-effort sync of everything queued; safe to call often (single-flight). */
export function syncAll(): Promise<void> {
  running ??= (async () => {
    try {
      await syncAttendance();
      await syncTapEvents();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "NETWORK")) console.warn("sync failed", e);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Enrolled students' public keys for offline verification. Uses the ETag so an unchanged roster
 * costs one 304, and falls back to the cached copy when offline.
 */
export async function loadRoster(classId: string): Promise<{ items: RosterKeyDto[]; fromCache: boolean }> {
  const cached = await getCachedRoster(classId);
  try {
    const res = await api.raw("GET", `/classes/${classId}/roster-keys`, {
      headers: cached ? { "if-none-match": `"${cached.version}"` } : {},
    });
    if (res.status === 304 && cached) return { items: cached.items, fromCache: false };
    if (!res.ok) throw new ApiError(res.status, "HTTP_" + res.status, "Could not load roster");
    const body = (await res.json()) as { version: string; items: RosterKeyDto[] };
    await setCachedRoster(classId, body.version, body.items);
    return { items: body.items, fromCache: false };
  } catch (e) {
    if (cached) return { items: cached.items, fromCache: true };
    throw e;
  }
}
