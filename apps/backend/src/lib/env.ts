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
  /** Disable the pg-boss publisher (tests). */
  get jobsDisabled() {
    return process.env.JOBS_DISABLED === "1";
  },
};
