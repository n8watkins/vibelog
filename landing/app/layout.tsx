import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "./site";

// Archivo's width axis gives the condensed, broadcast-graphics headlines;
// the same family at normal width carries the body copy.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

const title = "VibeLog - live stats for coding with AI agents";
const description =
  "VibeLog follows your repo and your AI agent session and shows what you are building, prompts, commits, sub-agents and tokens: on your stream, on a page you can share, and in a card for your channel. Runs locally, MIT licensed.";

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
    "open source",
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
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks JS as available before first paint, so scroll reveals never hide content without JS. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
