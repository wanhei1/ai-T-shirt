import type React from "react";
import type { Metadata } from "next";
import type { Viewport } from "next";
// import { GeistSans } from "geist/font/sans"
// import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next";
import { Suspense } from "react";
import { AuthProvider } from "@/contexts/auth-context";
import { LanguageProvider } from "@/contexts/language-context";
import { NavGuard } from "@/components/nav-guard";
import { PublicChrome } from "@/components/public-chrome";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "yituai - Design Your Perfect T-Shirt",
  description:
    "Create custom T-shirts with AI generation, text customization, and image uploads. Design your unique style today!",
  generator: "v0.app",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const enableVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true";

  return (
    <html lang="zh">
      <body suppressHydrationWarning className="font-sans antialiased">
        <LanguageProvider>
          <AuthProvider>
            <NavGuard />
            <PublicChrome>
              <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
            </PublicChrome>
            {enableVercelAnalytics ? <Analytics /> : null}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
