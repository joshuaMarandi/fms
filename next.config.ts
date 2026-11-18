import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Version of this build: the git commit (deploy.sh builds right after pulling). Open pages compare it
 * with the server's and reload themselves after a deploy; client navigation does a full load on a mismatch.
 */
function appVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}
const version = appVersion();

// The server works in East Africa Time (dates such as "today" and times on documents).
process.env.TZ = "Africa/Dar_es_Salaam";

const nextConfig: NextConfig = {
  deploymentId: version,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Every page is per-user and permission-aware, so render dynamically; no cache components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Keep visited pages in the browser for 5 minutes so going back to a tab opens it instantly.
    // Saves call revalidatePath or router.refresh, which clears this cache, so data never goes stale after an edit.
    staleTimes: { dynamic: 300, static: 300 },
    // Import only what is used from these packages.
    optimizePackageImports: ["recharts", "date-fns", "radix-ui", "@tanstack/react-table"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
};

export default nextConfig;
