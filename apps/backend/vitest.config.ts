import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://attendance:attendance@localhost:5432/attendance_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-0123456789",
      JOBS_DISABLED: "1",
      RATE_LIMIT_DISABLED: "1",
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
    },
  },
});
