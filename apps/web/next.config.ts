import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@shipflow/common", "@shipflow/db", "@shipflow/auth", "@shipflow/api"],
};

export default nextConfig;
