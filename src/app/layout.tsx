import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tweet/Thread Composer with Tone",
  description:
    "Compose tweets and threads in sampled tones (Naval, PG, MrBeast, ...) with hook-strength scoring, thread autosplit, engagement prediction and a draft queue.",
  keywords: [
    "tweet composer",
    "twitter thread",
    "tone sampling",
    "hook score",
    "engagement prediction",
    "Next.js",
    "Prisma",
  ],
  authors: [{ name: "Tweet/Thread Composer" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
