import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@shipflow/common", "@shipflow/db", "@shipflow/auth", "@shipflow/api"],
  env: {
    // Expose explicitly so Next.js picks these up at build time even if the
    // NEXT_PUBLIC_ prefix is omitted from the process environment in some envs.
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  },
};

export default nextConfig;