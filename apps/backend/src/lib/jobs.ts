import { PgBoss } from "pg-boss";
import { prisma } from "./db";
import { env } from "./env";

/** Queue names and payloads shared by the API (publisher) and src/worker (consumer). */
export const REMINDER_QUEUE = "session-reminder";
export const PUSH_QUEUE = "push";

export const REMINDER_LEAD_MS = 30 * 60_000;

export interface ReminderJob {
  sessionId: string;
}

export type PushJob =
  | { type: "SESSION_CHANGED" | "SESSION_CANCELLED"; sessionId: string }
  | { type: "ENROLLED"; deviceId: string; classId: string }
  | { type: "DEVICE_REVOKED"; deviceId: string };

const ONE_YEAR_SEC = 400 * 86_400;

let bossPromise: Promise<PgBoss> | null = null;

export async function ensureQueues(boss: PgBoss) {
  // Reminders may be queued months ahead, so keep "created" jobs well past the 14-day default.
  for (const name of [REMINDER_QUEUE, PUSH_QUEUE]) {
    if (!(await boss.getQueue(name))) {
      await boss.createQueue(name, { retentionSeconds: ONE_YEAR_SEC, retryLimit: 3, retryDelay: 30 });
    }
  }
}

/** Publisher-only instance for the API process (no maintenance/supervision). */
export function getPublisher(): Promise<PgBoss> {
  bossPromise ??= (async () => {
    const boss = new PgBoss({ connectionString: env.databaseUrl, supervise: false, schedule: false, max: 2 });
    boss.on("error", (e) => console.error("[pg-boss]", e));
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })().catch((e) => {
    bossPromise = null;
    throw e;
  });
  return bossPromise;
}

/** (Re)schedules the 30-minute reminder for a session. Safe to call after any create/update/cancel. */
export async function scheduleSessionReminder(sessionId: string): Promise<void> {
  // Inline mode: reminders are found by the cron sweep (sessions starting within 30 min), nothing to queue.
  if (env.jobsDisabled || env.jobsDriver === "inline") return;
  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session) return;
  const boss = await getPublisher();
  if (session.reminderJobId) {
    await boss.cancel(REMINDER_QUEUE, session.reminderJobId).catch(() => undefined);
  }
  let jobId: string | null = null;
  if (!session.cancelledAt && session.startsAt.getTime() > Date.now()) {
    const startAfter = new Date(Math.max(Date.now(), session.startsAt.getTime() - REMINDER_LEAD_MS));
    jobId = await boss.send(REMINDER_QUEUE, { sessionId } satisfies ReminderJob, { startAfter });
  }
  await prisma.classSession.update({ where: { id: sessionId }, data: { reminderJobId: jobId } });
}

export async function enqueuePush(job: PushJob): Promise<void> {
  if (env.jobsDisabled) return;
  try {
    if (env.jobsDriver === "inline") {
      // Serverless: no worker process, so send now (dynamic import avoids a module cycle).
      const { handlePushJob } = await import("./notifications");
      await handlePushJob(job);
      return;
    }
    const boss = await getPublisher();
    await boss.send(PUSH_QUEUE, job);
  } catch (e) {
    // Pushes are best-effort; never fail the API request because of them.
    console.error("[push] failed", e);
  }
}
