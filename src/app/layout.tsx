import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { VersionWatcher } from "@/components/pwa/version-watcher";
import { NavigationProgress } from "@/components/shell/navigation-progress";
import { ThemeProvider } from "@/components/shell/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Fleet Management System",
    template: "%s | FMS",
  },
  description: "Fleet, drivers, inspections, daily use, expenses, training, HR records and safety in one place.",
  applicationName: "FMS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FMS",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f3d34" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1714" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <NavigationProgress />
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="top-right" richColors={false} closeButton />
        </ThemeProvider>
        <RegisterServiceWorker />
        <VersionWatcher />
      </body>
    </html>
  );
}
