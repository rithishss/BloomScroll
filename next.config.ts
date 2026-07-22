import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads test fixtures at require-time when bundled; keep it (and
  // the LangChain loader that wraps it) external to the server bundle.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
