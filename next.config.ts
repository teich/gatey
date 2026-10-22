import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Copy only traced runtime dependencies into .next/standalone for deployments.
  output: "standalone",
};

export default nextConfig;
