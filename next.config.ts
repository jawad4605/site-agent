import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless Chrome must not be bundled by Next.js — load it from node_modules at runtime.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "mammoth"],
  // Make sure the compressed Chromium binary is shipped with the serverless function.
  outputFileTracingIncludes: {
    "/api/agent": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
