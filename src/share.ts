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

export type ShareData = {
  displayName: string;
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
  <!-- brand -->
  <g transform="translate(78 86)">
    <rect width="40" height="40" rx="12" fill="url(#brandg)"/>
    <text x="58" y="29" font-size="30" font-weight="800" fill="${text}" letter-spacing="-0.5">${name}</text>
  </g>
  ${inner}
  <text x="78" y="${CARD_H - 64}" font-size="22" fill="${muted}" font-weight="600">powered by <tspan fill="${accent}" font-weight="800">VibeLog</tspan></text>
</svg>`;
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

/** One big stat: value over a label. `x` is the column's left edge. */
function stat(d: ShareData, x: number, value: string, label: string, color: string): string {
  return `<g transform="translate(${x} 0)">
    <text x="0" y="372" font-size="76" font-weight="800" fill="${color}" letter-spacing="-1">${xmlEscape(value)}</text>
    <text x="2" y="416" font-size="24" font-weight="700" letter-spacing="2" fill="${v(d.theme, "--muted")}">${xmlEscape(label.toUpperCase())}</text>
  </g>`;
}

/** "Today's stats" card — features / time-live / tokens / commits + now-building. */
function statsCard(d: ShareData): string {
  const accent = v(d.theme, "--accent");
  const accent2 = v(d.theme, "--accent2");
  const pink = v(d.theme, "--pink");
  const text = v(d.theme, "--text");
  const header = xmlEscape(ellipsize(d.channelHeader || d.bio || "Live coding, streamed.", 64));

  const cols = [
    { v: fmtNum(d.stats.features), l: "features", c: text },
    { v: d.stats.timeLive, l: "time live", c: accent2 },
    { v: fmtNum(d.stats.tokens), l: "tokens", c: pink },
    { v: fmtNum(d.stats.commits), l: "commits", c: accent },
  ];
  const colW = 262;
  const startX = 78;
  const statsSvg = cols.map((c, i) => stat(d, startX + i * colW, c.v, c.l, c.c)).join("\n");

  const building = d.nowBuilding
    ? `<g transform="translate(78 ${CARD_H - 132})">
        <rect x="0" y="-30" width="14" height="14" rx="3" fill="${pink}"/>
        <text x="30" y="-18" font-size="26" font-weight="600" fill="${text}">${xmlEscape(ellipsize("Building: " + d.nowBuilding, 56))}</text>
      </g>`
    : "";

  const inner = `
  ${statusPill(d)}
  <text x="78" y="210" font-size="30" font-weight="600" fill="${v(d.theme, "--muted")}">${header}</text>
  ${statsSvg}
  ${building}`;
  return frame(d, inner);
}

/** "Join VibeLog" invite card — big gradient headline + tagline. */
function joinCard(d: ShareData): string {
  const text = v(d.theme, "--text");
  const muted = v(d.theme, "--muted");
  const who = d.displayName && d.displayName !== "VibeLog"
    ? `${ellipsize(d.displayName, 28)} streams their builds with VibeLog.`
    : "Stream your public development to the world.";

  const inner = `
  ${statusPill(d)}
  <text x="78" y="270" font-size="92" font-weight="800" fill="url(#flow)" letter-spacing="-3">Stream what</text>
  <text x="78" y="368" font-size="92" font-weight="800" fill="url(#flow)" letter-spacing="-3">you build.</text>
  <text x="78" y="446" font-size="30" font-weight="600" fill="${muted}">${xmlEscape(ellipsize(who, 66))}</text>
  <text x="78" y="492" font-size="26" font-weight="700" fill="${text}">A live overlay, dashboard &amp; public page — local-first. Join VibeLog.</text>`;
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
