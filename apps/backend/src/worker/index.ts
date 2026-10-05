/**
 * Background worker (run as a separate process: `pnpm --filter @attendance/backend worker`).
 * - session-reminder jobs: FCM reminder 30 minutes before each session
 * - push jobs: session changed/cancelled, enrolled, device revoked
 * - every 5 minutes: sweep for sessions that should have had a reminder but did not
 */
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { env } from "../lib/env";
import { ensureQueues, PUSH_QUEUE, REMINDER_QUEUE, type PushJob, type ReminderJob } from "../lib/jobs";
import { handlePushJob, notifySession, sweepMissedReminders } from "../lib/notifications";
import { prisma } from "../lib/db";

const SWEEP_MS = 5 * 60_000;

async function main() {
  const boss = new PgBoss({ connectionString: env.databaseUrl });
  boss.on("error", (e) => console.error("[worker] pg-boss error", e));
  await boss.start();
  await ensureQueues(boss);

  await boss.work<ReminderJob>(REMINDER_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const sent = await notifySession(job.data.sessionId, "REMINDER_30");
      console.info(`[worker] reminder ${job.data.sessionId}: ${sent} sent`);
    }
  });

  await boss.work<PushJob>(PUSH_QUEUE, async (jobs) => {
    for (const job of jobs) await handlePushJob(job.data);
  });

  const sweep = async () => {
    try {
      const n = await sweepMissedReminders();
      if (n) console.info(`[worker] sweep sent ${n} missed reminders`);
    } catch (e) {
      console.error("[worker] sweep failed", e);
    }
  };
  await sweep();
  const timer = setInterval(sweep, SWEEP_MS);

  console.info("[worker] running");
  const shutdown = async () => {
    clearInterval(timer);
    await boss.stop({ graceful: true });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
