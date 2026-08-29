import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Copy only traced runtime dependencies into .next/standalone for deployments.
  output: "standalone",
  // Next's TypeScript CLI cannot parse `tsc --showConfig` output on Node 26.
  // Keep the compiler API checker until that upstream incompatibility is fixed.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
