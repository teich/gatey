import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The CLI checker has a Node 26 process-output issue in the local dev host.
  // The compiler API performs the same build-time type check without spawning it.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
