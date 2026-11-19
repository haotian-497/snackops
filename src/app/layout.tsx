import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { AppProviders } from "@/components/providers";

import "./globals.css";

// Noto Sans SC 是可变字体；多 weight 数组在 Turbopack 下会触发
// "Can't resolve '@vercel/turbopack-next/internal/font/google/font'"
const notoSans = Noto_Sans_SC({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SnackOps",
  description: "零食电商客服 Agent / Planner / Skill / Tool / Eval 运营平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${notoSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground" suppressHydrationWarning>
        <AppProviders>
          <div className="flex min-h-full flex-col">
            <AppNav />
            <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-5">{children}</main>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
