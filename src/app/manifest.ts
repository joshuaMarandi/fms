import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MDV Fleet Management System",
    short_name: "MDV FMS",
    description: "Fleet, drivers, inspections, daily use, expenses, training, HR records and safety in one place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f3ee",
    theme_color: "#0f3d34",
    lang: "en",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Daily inspection", url: "/inspections/daily/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Km log", url: "/daily-use/km-log/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Fuel request", url: "/daily-use/fuel-log/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
