import { execSync } from "node:child_process";

/** Applies pending migrations to the test database once per run (tests truncate tables themselves). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://attendance:attendance@localhost:5432/attendance_test";
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
