/**
 * Share cards (G1/G2). Server-rendered social images + the data that feeds them.
 *
 * A card is a themed 1200×630 SVG (the standard OG / Twitter `summary_large_image`
 * size) rasterised to PNG with @resvg/resvg-js, so links unfurl on Twitter/Discord/
 * Slack/iMessage (all of which reject SVG og:images). It is built from ONLY the
 * already-public surface — the four sanitised profile fields + the public numeric
 * LiveState stats + the resolved theme vars. No paths, prompts, tokens or secrets.
 *
 * Security: every dynamic string is XML-escaped before it enters the SVG (profile
 * fields and `nowBuilding` are user-typed and may contain `<`, `&`, `"`); theme
 * values are already allowlist-validated (see src/theme.ts) so they're safe as
 * SVG attribute values. The SVG itself never embeds remote refs (no <image href>,
 * no url()) so a card can't be an exfil vector.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_THEME, type ThemeVars } from "./theme.ts";

export type ShareKind = "stats" | "join" | "profile" | "recap";
export const SHARE_KINDS: ShareKind[] = ["stats", "join", "profile", "recap"];
export function isShareKind(s: string): s is ShareKind {
  return (SHARE_KINDS as string[]).includes(s);
}

/** The creator's stream channel, derived from the channel URL they configured. */
export type Channel = { platform: "twitch" | "youtube"; handle: string; url: string };

const PLATFORM_LABEL: Record<Channel["platform"], string> = { twitch: "Twitch", youtube: "YouTube" };

/**
 * Turn configured channel URLs into a public, display-safe channel. Only
 * twitch.tv/<login> and youtube.com/@<handle> are accepted, and the handle must
 * match the platform's character set, so a card can never carry an arbitrary
 * URL. Prefers the platform that is live right now, then Twitch, then YouTube.
 */
export function channelFrom(
  urls: { twitch?: string | null; youtube?: string | null },
  live: { twitch?: boolean; youtube?: boolean } = {},
): Channel | null {
  const parse = (raw: string | null | undefined, platform: Channel["platform"]): Channel | null => {
    if (!raw) return null;
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (platform === "twitch" && host === "twitch.tv" && /^[a-z0-9_]{2,25}$/i.test(seg)) {
      return { platform, handle: seg, url: `twitch.tv/${seg}` };
    }
    if (platform === "youtube" && host === "youtube.com" && /^@[a-z0-9._-]{3,30}$/i.test(seg)) {
      return { platform, handle: seg, url: `youtube.com/${seg}` };
    }
    return null;
  };
  const tw = parse(urls.twitch, "twitch");
  const yt = parse(urls.youtube, "youtube");
  if (live.youtube && yt && !live.twitch) return yt;
  return tw ?? yt;
}

export type ShareData = {
  displayName: string;
  /** Where viewers should go: the creator's channel (public, see channelFrom). */
  channel?: Channel | null;
  channelHeader?: string;
  bio?: string;
  twitter?: string;
  live: boolean;
  nowBuilding?: string;
  /** Headline numbers for the "stats" card. */
  stats: { features: number; commits: number; tokens: number; timeLive: string };
  /** Optional weekly rollup for the "recap" card — PUBLIC-NUMERIC only: per-day
   *  vibe scores (no titles/paths), the current streak, and shipped/fixed counts.
   *  `days` is oldest→newest; `date` is an ISO yyyy-mm-dd (used only for weekday). */
  recap?: { days: { date: string; score: number }[]; streak: number; features: number; fixes: number };
  /** Resolved (allowlist-validated) theme vars to paint the card with. */
  theme: ThemeVars;
};

const CARD_W = 1200;
const CARD_H = 630;

/** Compact human number: 1_300_000 → "1.3M", 134_000 → "134k", 12 → "12".
 *  Drops the decimal once the scaled value reaches 3 digits so a card column
 *  never has to fit more than ~4 glyphs ("133.8k" would overflow; "134k" fits). */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const scale = (x: number, suffix: string) =>
    (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, "")) + suffix;
  if (n >= 1e6) return scale(n / 1e6, "M");
  if (n >= 1e3) return scale(n / 1e3, "k");
  return String(Math.round(n));
}

/** Elapsed-since label for the "time live" stat: "47m", "4.2h", "—". */
export function timeLiveLabel(startedAt: string | null | undefined, now = Date.now()): string {
  if (!startedAt) return "—";
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return mins + "m";
  return (mins / 60).toFixed(1).replace(/\.0$/, "") + "h";
}

/** XML/SVG-escape a text value. Drops the few chars that could break out of a
 *  text node or an attribute. Pure; total. */
export function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncate to n chars with an ellipsis (counted before escaping). */
function ellipsize(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

// We bundle DejaVu Sans (public/fonts) and load ONLY it (no system fonts) so a card
// rasterises to an identical PNG on any machine. Keep it first in the stack; the
// remaining families are inert fallbacks should the bundled file ever be missing.
const FONT = "'DejaVu Sans', Inter, 'Segoe UI', 'Liberation Sans', Arial, sans-serif";

/** Pull a theme var with a fallback to the default theme. */
function v(theme: ThemeVars, key: keyof ThemeVars): string {
  return theme[key] ?? DEFAULT_THEME.vars[key] ?? "#ffffff";
}

/** Shared frame: background, aurora blobs, glass panel, brand + footer. The
 *  caller supplies the inner content already positioned inside the panel. */
function frame(d: ShareData, inner: string): string {
  const bg = v(d.theme, "--bg");
  const accent = v(d.theme, "--accent");
  const accent2 = v(d.theme, "--accent2");
  const pink = v(d.theme, "--pink");
  const text = v(d.theme, "--text");
  const muted = v(d.theme, "--muted");
  const aurora1 = v(d.theme, "--aurora1");
  const aurora2 = v(d.theme, "--aurora2");
  const name = xmlEscape(ellipsize(d.displayName || "VibeLog", 34));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="${FONT}">
  <defs>
    <radialGradient id="a1" cx="78%" cy="8%" r="62%">
      <stop offset="0%" stop-color="${aurora1}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${aurora1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="a2" cx="14%" cy="104%" r="60%">
      <stop offset="0%" stop-color="${aurora2}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${aurora2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="50%" stop-color="${pink}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
    <linearGradient id="brandg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
    <linearGradient id="vmark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a06bff"/>
      <stop offset="100%" stop-color="#2ee6b6"/>
    </linearGradient>
    <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="42%" stop-color="${pink}"/>
      <stop offset="78%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#a1)"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#a2)"/>
  <rect x="36" y="36" width="${CARD_W - 72}" height="${CARD_H - 72}" rx="28" fill="#000000" fill-opacity="0.28" stroke="url(#ring)" stroke-width="2"/>
  <!-- the creator -->
  <text x="78" y="114" font-size="34" font-weight="800" fill="${text}" letter-spacing="-0.5">${name}</text>
  ${inner}
  <!-- VibeLog, kept small: the card is about the creator's stream -->
  <g transform="translate(${CARD_W - 78 - 136} ${CARD_H - 92})" opacity="0.8">
    ${vMark(22)}
    <text x="30" y="17" font-size="17" font-weight="700" fill="${muted}">VibeLog</text>
  </g>
</svg>`;
}

/** The VibeLog "V" mark (same artwork as the site favicon), `size` px square. */
export function vMark(size: number): string {
  const k = size / 64;
  return `<g transform="scale(${k})"><rect width="64" height="64" rx="18" fill="url(#vmark)"/><path d="M18 22l9 22 4-10 4 10 11-22" fill="none" stroke="#07060d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

/** "Watch live on Twitch" (live), "Follow on YouTube" (not live), or a fallback. */
function callToAction(d: ShareData): { headline: string; target: string } {
  if (d.channel) {
    const where = PLATFORM_LABEL[d.channel.platform];
    return { headline: d.live ? `Watch live on ${where}` : `Follow on ${where}`, target: d.channel.url };
  }
  const tw = (d.twitter || "").trim().replace(/^@+/, "");
  if (tw) return { headline: d.live ? "Live now" : "Follow along", target: `@${tw}` };
  return { headline: d.live ? "Live now" : "Building in public", target: "" };
}

/** A coloured "LIVE"/"ONLINE" status pill, top-right. */
function statusPill(d: ShareData): string {
  const live = d.live;
  const col = live ? "#ff4d5e" : v(d.theme, "--muted");
  const label = live ? "LIVE" : "ONLINE";
  const w = live ? 132 : 168;
  const x = CARD_W - 78 - w;
  return `<g transform="translate(${x} 70)">
    <rect width="${w}" height="46" rx="23" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-opacity="0.5"/>
    <circle cx="28" cy="23" r="7" fill="${col}"/>
    <text x="48" y="31" font-size="20" font-weight="800" letter-spacing="2" fill="${col}">${label}</text>
  </g>`;
}

/** The default card: sends people to the creator's channel, with what they are
 *  building and a small strip of today's numbers. */
function statsCard(d: ShareData): string {
  const accent = v(d.theme, "--accent");
  const accent2 = v(d.theme, "--accent2");
  const pink = v(d.theme, "--pink");
  const text = v(d.theme, "--text");
  const muted = v(d.theme, "--muted");
  const header = d.channelHeader || d.bio;
  const cta = callToAction(d);

  const building = d.nowBuilding
    ? `<text x="78" y="416" font-size="28" font-weight="600" fill="${text}"><tspan fill="${pink}">Building: </tspan>${xmlEscape(ellipsize(d.nowBuilding, 52))}</text>`
    : "";

  const strip = [
    `${fmtNum(d.stats.features)} features`,
    `${fmtNum(d.stats.commits)} commits`,
    `${d.stats.timeLive} live`,
  ]
    .map((t, i) => `<text x="${78 + i * 210}" y="${CARD_H - 74}" font-size="24" font-weight="700" fill="${muted}">${xmlEscape(t)}</text>`)
    .join("\n");

  const inner = `
  ${statusPill(d)}
  ${header ? `<text x="78" y="156" font-size="26" font-weight="600" fill="${muted}">${xmlEscape(ellipsize(header, 64))}</text>` : ""}
  <text x="78" y="268" font-size="76" font-weight="800" fill="url(#flow)" letter-spacing="-2">${xmlEscape(cta.headline)}</text>
  ${cta.target ? `<text x="80" y="330" font-size="38" font-weight="800" fill="${d.live ? accent2 : accent}">${xmlEscape(cta.target)}</text>` : ""}
  ${building}
  ${strip}`;
  return frame(d, inner);
}

/** Invite card: "come watch <name> build", pointing at their channel. */
function joinCard(d: ShareData): string {
  const muted = v(d.theme, "--muted");
  const accent2 = v(d.theme, "--accent2");
  const name = d.displayName && d.displayName !== "VibeLog" ? ellipsize(d.displayName, 20) : "me";
  const cta = callToAction(d);
  const inner = `
  ${statusPill(d)}
  <text x="78" y="262" font-size="88" font-weight="800" fill="url(#flow)" letter-spacing="-3">Come watch</text>
  <text x="78" y="358" font-size="88" font-weight="800" fill="url(#flow)" letter-spacing="-3">${xmlEscape(name)} build.</text>
  <text x="78" y="432" font-size="30" font-weight="600" fill="${muted}">${xmlEscape(ellipsize(d.channelHeader || d.bio || "Coding with AI agents, live.", 60))}</text>
  ${cta.target ? `<text x="78" y="${CARD_H - 74}" font-size="34" font-weight="800" fill="${accent2}">${xmlEscape(cta.target)}</text>` : ""}`;
  return frame(d, inner);
}

/** "My VibeLog" profile card — leads with the creator's channel identity
 *  (handle + header + bio) and treats the numbers as a supporting strip. Where
 *  `stats` leads with today's figures and `join` is a generic invite, this is the
 *  personal "here's my channel" card. */
function profileCard(d: ShareData): string {
  const accent2 = v(d.theme, "--accent2");
  const text = v(d.theme, "--text");
  const muted = v(d.theme, "--muted");
  const header = xmlEscape(ellipsize(d.channelHeader || d.bio || "Building in public, live.", 30));
  const bio = d.bio && d.bio.trim() && d.bio.trim() !== (d.channelHeader || "").trim()
    ? xmlEscape(ellipsize(d.bio, 70))
    : "";
  const handleRaw = (d.twitter || "").trim().replace(/^@+/, "");
  const handle = handleRaw ? "@" + xmlEscape(ellipsize(handleRaw, 24)) : "";

  // Compact supporting strip: a few signature numbers, value over label.
  const chips = [
    { v: fmtNum(d.stats.features), l: "features" },
    { v: fmtNum(d.stats.commits), l: "commits" },
    { v: fmtNum(d.stats.tokens), l: "tokens" },
    { v: d.stats.timeLive, l: "time live" },
  ];
  const chipW = 256;
  const chipStrip = chips
    .map((c, i) => `<g transform="translate(${78 + i * chipW} 472)">
      <text x="0" y="0" font-size="44" font-weight="800" fill="${text}" letter-spacing="-0.5">${xmlEscape(c.v)}</text>
      <text x="2" y="32" font-size="20" font-weight="700" letter-spacing="1.5" fill="${muted}">${xmlEscape(c.l.toUpperCase())}</text>
    </g>`)
    .join("\n");

  const inner = `
  ${statusPill(d)}
  ${handle ? `<text x="78" y="206" font-size="27" font-weight="700" fill="${accent2}">${handle}</text>` : ""}
  <text x="78" y="306" font-size="72" font-weight="800" fill="url(#flow)" letter-spacing="-2">${header}</text>
  ${bio ? `<text x="78" y="358" font-size="30" font-weight="600" fill="${muted}">${bio}</text>` : ""}
  ${chipStrip}`;
  return frame(d, inner);
}

const RECAP_DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** "This week" recap card — the last 7 days as small bars (heights scaled to the
 *  busiest day), the current streak, and shipped/fixed counts. Mirrors the
 *  `vibe week` rollup but with PUBLIC-NUMERIC data only (per-day vibe scores, no
 *  titles). Same neon frame as statsCard/profileCard. */
function recapCard(d: ShareData): string {
  const accent = v(d.theme, "--accent");
  const accent2 = v(d.theme, "--accent2");
  const pink = v(d.theme, "--pink");
  const text = v(d.theme, "--text");
  const muted = v(d.theme, "--muted");
  const days = (d.recap?.days ?? []).slice(-7);
  const streak = Math.max(0, Math.floor(d.recap?.streak ?? 0));
  const features = Math.max(0, Math.floor(d.recap?.features ?? 0));
  const fixes = Math.max(0, Math.floor(d.recap?.fixes ?? 0));
  const header = xmlEscape(ellipsize(d.channelHeader || d.bio || "My week in public.", 64));

  // 7 bars across the panel; heights scale to the busiest day in the window.
  const max = Math.max(1, ...days.map((x) => (Number.isFinite(x.score) ? x.score : 0)));
  const barW = 96;
  const gap = 28;
  const startX = 78;
  const baseY = 392; // bar baseline
  const maxH = 150;
  const bars = days
    .map((x, i) => {
      const score = Math.max(0, Number.isFinite(x.score) ? x.score : 0);
      const h = score > 0 ? Math.max(8, Math.round((score / max) * maxH)) : 4;
      const x0 = startX + i * (barW + gap);
      const dow = RECAP_DOW[new Date((x.date || "") + "T00:00:00").getDay()] ?? "·";
      const fill = score > 0 ? "url(#brandg)" : v(d.theme, "--muted");
      const op = score > 0 ? "1" : "0.3";
      return `<g transform="translate(${x0} 0)">
      <rect x="0" y="${baseY - h}" width="${barW}" height="${h}" rx="8" fill="${fill}" fill-opacity="${op}"/>
      <text x="${barW / 2}" y="${baseY + 34}" font-size="24" font-weight="700" text-anchor="middle" fill="${muted}">${xmlEscape(dow)}</text>
    </g>`;
    })
    .join("\n");

  const cols = [
    { v: streak + "d", l: "streak", c: pink },
    { v: fmtNum(features), l: "features", c: accent2 },
    { v: fmtNum(fixes), l: "fixes", c: accent },
  ];
  const colW = 248;
  // Strip sits above the frame's "powered by VibeLog" footer (y = CARD_H - 64).
  // Number baseline at CARD_H - 140, label 32px below it (≈ CARD_H - 108) — both
  // clear of the footer so they never overlap it.
  const strip = cols
    .map((c, i) => `<g transform="translate(${startX + i * colW} ${CARD_H - 140})">
      <text x="0" y="0" font-size="52" font-weight="800" fill="${c.c}" letter-spacing="-0.5">${xmlEscape(c.v)}</text>
      <text x="2" y="32" font-size="20" font-weight="700" letter-spacing="1.5" fill="${muted}">${xmlEscape(c.l.toUpperCase())}</text>
    </g>`)
    .join("\n");

  const inner = `
  ${statusPill(d)}
  <text x="78" y="184" font-size="34" font-weight="800" fill="${text}" letter-spacing="-0.5">This week</text>
  <text x="78" y="224" font-size="26" font-weight="600" fill="${muted}">${header}</text>
  ${bars}
  ${strip}`;
  return frame(d, inner);
}

/** Build the themed SVG string for a card kind. Pure. */
export function shareCardSvg(kind: ShareKind, d: ShareData): string {
  if (kind === "join") return joinCard(d);
  if (kind === "profile") return profileCard(d);
  if (kind === "recap") return recapCard(d);
  return statsCard(d);
}

/** Absolute paths to the bundled DejaVu Sans faces (regular + bold). Resolved
 *  relative to this module so it works whatever the process cwd is — same trick
 *  as PUBLIC_DIR in src/agent.ts. Weights 600/700/800 in the SVG all snap to Bold. */
const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts");
const FONT_FILES = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map((f) => path.join(FONTS_DIR, f));

/** Rasterise a card SVG to a PNG buffer (1200×630). Renders with ONLY the bundled
 *  DejaVu Sans fonts (loadSystemFonts: false) so the output is deterministic across
 *  machines regardless of what fonts are installed locally. */
export function renderCardPng(svg: string): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_W },
    background: "rgba(0,0,0,0)",
    font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: "DejaVu Sans" },
  });
  return r.render().asPng();
}
