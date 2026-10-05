function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get jwtSecret() {
    const s = required("JWT_SECRET");
    if (s.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
    return s;
  },
  get exportHashSalt() {
    return process.env.EXPORT_HASH_SALT ?? "attendance";
  },
  get firebaseServiceAccount() {
    return process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null;
  },
  /** Disable background jobs entirely (tests). */
  get jobsDisabled() {
    return process.env.JOBS_DISABLED === "1";
  },
  /**
   * "pgboss": long-running worker process (Docker/VM). "inline": serverless (Vercel), where pushes are sent
   * within the request and reminders come from /api/v1/cron/reminders. Defaults to inline on Vercel.
   */
  get jobsDriver(): "pgboss" | "inline" {
    const v = process.env.JOBS_DRIVER;
    if (v === "pgboss" || v === "inline") return v;
    return process.env.VERCEL ? "inline" : "pgboss";
  },
  /** Shared secret for the cron endpoint (Vercel Cron / GitHub Actions send "Authorization: Bearer <secret>"). */
  get cronSecret() {
    return process.env.CRON_SECRET || null;
  },
};
