import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
