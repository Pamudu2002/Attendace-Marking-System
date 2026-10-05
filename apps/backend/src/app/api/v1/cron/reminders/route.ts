import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ApiError, handler, json } from "@/lib/http";
import { sweepMissedReminders } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends the 30-minute reminders for sessions starting soon that have not had one yet.
 * On Vercel (no worker process) call this every few minutes with "Authorization: Bearer $CRON_SECRET"
 * (GitHub Actions schedule in .github/workflows/reminders-cron.yml, Vercel Cron, or cron-job.org).
 */
async function run(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid cron secret");
  }
  const sent = await sweepMissedReminders();
  return json({ ok: true, sent, at: new Date().toISOString() });
}

export const GET = handler(run);
export const POST = handler(run);
