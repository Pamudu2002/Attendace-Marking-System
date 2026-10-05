import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection; Neon on Vercel provides DATABASE_URL_UNPOOLED.
    // Left undefined at `prisma generate` time, which does not need a database.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  },
});
