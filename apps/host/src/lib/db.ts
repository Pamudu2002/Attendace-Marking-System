import * as SQLite from "expo-sqlite";
import type { RosterKeyDto, TapEventInput } from "@attendance/shared";

/**
 * Local store so check-in works without internet (docs/PLAN.md §5.1 H6/H7):
 * - pending_attendance: verified taps waiting to be uploaded
 * - tap_events: experiment telemetry, one row per tap attempt
 * - roster_cache: enrolled students' public keys per class
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync("attendance-host.db");
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS pending_attendance (
        client_record_id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        index_number TEXT NOT NULL,
        status TEXT NOT NULL,
        tapped_at TEXT NOT NULL,
        nonce TEXT NOT NULL,
        host_time INTEGER NOT NULL,
        signature TEXT NOT NULL,
        sync_result TEXT,
        sync_reason TEXT,
        synced_at TEXT
      );
      CREATE INDEX IF NOT EXISTS pending_attendance_session ON pending_attendance(session_id);
      CREATE TABLE IF NOT EXISTS tap_events (
        client_event_id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS roster_cache (
        class_id TEXT PRIMARY KEY NOT NULL,
        version TEXT NOT NULL,
        items TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );
    `);
    return d;
  })();
  return dbPromise;
}

export interface PendingRecord {
  client_record_id: string;
  session_id: string;
  device_id: string;
  student_id: string;
  full_name: string;
  index_number: string;
  status: "PRESENT" | "LATE";
  tapped_at: string;
  nonce: string;
  host_time: number;
  signature: string;
  sync_result: string | null;
  sync_reason: string | null;
  synced_at: string | null;
}

export async function insertAttendance(r: Omit<PendingRecord, "sync_result" | "sync_reason" | "synced_at">) {
  const d = await db();
  await d.runAsync(
    `INSERT OR IGNORE INTO pending_attendance
     (client_record_id, session_id, device_id, student_id, full_name, index_number, status, tapped_at, nonce, host_time, signature)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.client_record_id, r.session_id, r.device_id, r.student_id, r.full_name, r.index_number, r.status, r.tapped_at, r.nonce, r.host_time, r.signature],
  );
}

export async function sessionRecords(sessionId: string): Promise<PendingRecord[]> {
  return (await db()).getAllAsync<PendingRecord>(
    "SELECT * FROM pending_attendance WHERE session_id = ? ORDER BY tapped_at DESC",
    [sessionId],
  );
}

export async function unsyncedRecords(): Promise<PendingRecord[]> {
  return (await db()).getAllAsync<PendingRecord>("SELECT * FROM pending_attendance WHERE synced_at IS NULL ORDER BY tapped_at");
}

export async function markRecordSynced(id: string, result: string, reason: string | null) {
  await (await db()).runAsync(
    "UPDATE pending_attendance SET sync_result = ?, sync_reason = ?, synced_at = ? WHERE client_record_id = ?",
    [result, reason, new Date().toISOString(), id],
  );
}

export async function insertTapEvent(id: string, payload: object) {
  await (await db()).runAsync("INSERT OR IGNORE INTO tap_events (client_event_id, payload, created_at) VALUES (?, ?, ?)", [
    id,
    JSON.stringify(payload),
    Date.now(),
  ]);
}

export async function unsyncedTapEvents(limit = 500): Promise<{ client_event_id: string; payload: string }[]> {
  return (await db()).getAllAsync("SELECT client_event_id, payload FROM tap_events WHERE synced = 0 ORDER BY created_at LIMIT ?", [limit]);
}

export async function markTapEventsSynced(ids: string[]) {
  if (ids.length === 0) return;
  const d = await db();
  await d.withTransactionAsync(async () => {
    for (const id of ids) await d.runAsync("UPDATE tap_events SET synced = 1 WHERE client_event_id = ?", [id]);
  });
}

export interface LocalTapStats {
  total: number;
  ok: number;
  unsynced: number;
  rows: TapEventInput[];
}

export async function recentTapEvents(limit = 300): Promise<LocalTapStats> {
  const d = await db();
  const rows = await d.getAllAsync<{ payload: string; synced: number }>(
    "SELECT payload, synced FROM tap_events ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
  const parsed = rows.map((r) => JSON.parse(r.payload) as TapEventInput);
  return {
    total: rows.length,
    ok: parsed.filter((p) => p.outcome === "OK" || p.outcome === "DUPLICATE").length,
    unsynced: rows.filter((r) => !r.synced).length,
    rows: parsed,
  };
}

export async function getCachedRoster(classId: string): Promise<{ version: string; items: RosterKeyDto[] } | null> {
  const row = await (await db()).getFirstAsync<{ version: string; items: string }>(
    "SELECT version, items FROM roster_cache WHERE class_id = ?",
    [classId],
  );
  return row ? { version: row.version, items: JSON.parse(row.items) } : null;
}

export async function setCachedRoster(classId: string, version: string, items: RosterKeyDto[]) {
  await (await db()).runAsync(
    "INSERT OR REPLACE INTO roster_cache (class_id, version, items, fetched_at) VALUES (?, ?, ?, ?)",
    [classId, version, JSON.stringify(items), Date.now()],
  );
}

export async function pendingCounts(): Promise<{ attendance: number; taps: number }> {
  const d = await db();
  const a = await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pending_attendance WHERE synced_at IS NULL");
  const t = await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM tap_events WHERE synced = 0");
  return { attendance: a?.n ?? 0, taps: t?.n ?? 0 };
}

/** Small JSON cache (e.g. session details so check-in can start offline). */
export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await (await db()).getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(key: string, value: unknown) {
  await (await db()).runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);
}
