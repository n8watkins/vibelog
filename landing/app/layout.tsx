import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "./site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

const title = "VibeLog - proof of work, live";
const description =
  "A local-first OBS overlay, public live page and share cards that show what you are building with AI, with real git and token numbers. Open source, self-hostable.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: "%s - VibeLog" },
  description,
  applicationName: "VibeLog",
  authors: [{ name: "N8", url: "https://n8builds.dev" }],
  creator: "N8",
  keywords: [
    "OBS overlay",
    "coding stream overlay",
    "vibe coding",
    "build in public",
    "Claude Code",
    "token usage",
    "git stats",
    "Twitch",
    "developer live page",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "VibeLog",
    title,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "A VibeLog share card showing features, time live, tokens and commits" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#07060d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
