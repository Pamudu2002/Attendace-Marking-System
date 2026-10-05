import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@attendance/shared"],
  serverExternalPackages: ["@node-rs/argon2", "pg-boss", "firebase-admin", "pg"],
};

export default nextConfig;
