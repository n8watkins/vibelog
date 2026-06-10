/**
 * Theming model. A theme is a flat object of CSS-variable values applied at
 * runtime on `document.documentElement.style`, so one theme re-skins an entire
 * page — background, accents, the travelling-gradient ring stops, glass, aurora
 * blobs and the dashboard heatmap ramp all read from these vars.
 *
 * Security boundary: THEME_VAR_KEYS is an allowlist and `validateVars` strips
 * any unknown key and rejects any value that isn't a plain color/gradient
 * string. Themes are the ONLY settings-derived data ever served publicly
 * (overlay in OBS reads /api/theme.json with no auth), so a custom palette must
 * never be able to smuggle CSS (url(), @import, ; } < >) into an overlay page.
 * Tokens/secrets never live here — they stay in secrets.json. See docs/THEMING.md.
 */

/** The exact set of CSS variables a theme may set. Anything else is dropped. */
export const THEME_VAR_KEYS = [
  "--bg", "--text", "--muted",
  "--accent", "--accent2", "--pink",
  "--g1", "--g2", "--g3",
  "--glass", "--border", "--glow",
  "--aurora1", "--aurora2",
  "--l0", "--l1", "--l2", "--l3", "--l4",
] as const;

export type ThemeVarKey = (typeof THEME_VAR_KEYS)[number];
export type ThemeVars = Partial<Record<ThemeVarKey, string>>;
export type Theme = { id: string; name: string; vars: ThemeVars };

export type Page = "overlay" | "live" | "dashboard";
const PAGES: Page[] = ["overlay", "live", "dashboard"];

export type Settings = {
  version: 1;
  theme: {
    /** When true (default), all pages share `shared`. When false, each page
     *  may use its own `perPage` theme (falling back to `shared`). */
    sync: boolean;
    shared: ThemeVars;
    perPage?: Partial<Record<Page, ThemeVars>>;
    /** Last-picked preset id — for highlighting the active swatch in the UI. */
    presetId?: string;
  };
  // --- structure reserved for later phases; no UI yet (see docs/VISION.md) ---
  profile?: { displayName?: string; bio?: string; twitter?: string; channelHeader?: string };
  integrations?: {
    twitch?: { connected: boolean; login?: string };
    youtube?: { connected: boolean; channelId?: string };
    discord?: { connected: boolean };
    github?: { connected: boolean; login?: string };
  };
};

/** Only chars that appear in colors and gradient functions. No ;{}<>\"' etc. */
const SAFE_VALUE = /^[#0-9a-z.,%()\s-]+$/i;
const UNSAFE = /url\(|expression|javascript:|@import|[;{}<>\\"']/i;

/**
 * Keep only allowlisted keys whose values are plain color/gradient strings.
 * Pure; never throws. Used on every read (theme served publicly) and write.
 */
export function validateVars(input: unknown): ThemeVars {
  const out: ThemeVars = {};
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  for (const key of THEME_VAR_KEYS) {
    const v = obj[key];
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || s.length > 240) continue;
    if (UNSAFE.test(s) || !SAFE_VALUE.test(s)) continue;
    out[key] = s;
  }
  return out;
}

const rgba = (hex: string, a: number): string => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Build a full theme from a small seed; structural vars are derived. */
function mk(s: {
  id: string; name: string;
  bg: string; deep: string; text?: string; muted: string;
  accent: string; accent2: string; pink: string;
  aurora1: string; aurora2: string; l0: string; l1: string;
}): Theme {
  return {
    id: s.id,
    name: s.name,
    vars: {
      "--bg": s.bg, "--text": s.text ?? "#f3f0ff", "--muted": s.muted,
      "--accent": s.accent, "--accent2": s.accent2, "--pink": s.pink,
      "--g1": s.accent, "--g2": s.pink, "--g3": s.accent2,
      "--glass": `linear-gradient(165deg, ${rgba(s.deep, 0.55)}, ${rgba(s.bg, 0.66)})`,
      "--border": rgba(s.accent, 0.3),
      "--glow": `0 0 22px ${rgba(s.accent, 0.22)}`,
      "--aurora1": s.aurora1, "--aurora2": s.aurora2,
      "--l0": s.l0, "--l1": s.l1, "--l2": s.accent2, "--l3": s.accent, "--l4": s.pink,
    },
  };
}

/** The default — matches the hand-written CSS :root exactly so an unset/absent
 *  settings.json looks identical to today (zero-config still on-brand). */
export const DEFAULT_THEME: Theme = {
  id: "aurora-purple",
  name: "Aurora Purple",
  vars: {
    "--bg": "#07060e", "--text": "#f3f0ff", "--muted": "#a99fce",
    "--accent": "#a06bff", "--accent2": "#22d3a6", "--pink": "#ff5cf0",
    "--g1": "#a06bff", "--g2": "#ff5cf0", "--g3": "#22d3a6",
    "--glass": "linear-gradient(165deg, rgba(38, 22, 72, 0.55), rgba(14, 11, 28, 0.62))",
    "--border": "rgba(167, 134, 255, 0.30)",
    "--glow": "0 0 22px rgba(160, 107, 255, 0.22)",
    "--aurora1": "#3a1d7a", "--aurora2": "#0f3a44",
    "--l0": "#241b3a", "--l1": "#3a2d6e", "--l2": "#6a4bd0", "--l3": "#a06bff", "--l4": "#ff5cf0",
  },
};

/** ~10 curated presets. Randomize picks from these — never arbitrary RGB. */
export const PRESETS: Theme[] = [
  DEFAULT_THEME,
  mk({ id: "cyber-mint", name: "Cyber Mint", bg: "#04100f", deep: "#0c3430", muted: "#8fc7b9", accent: "#2ee6c0", accent2: "#3aa0ff", pink: "#5cffd6", aurora1: "#0d6e5e", aurora2: "#123a4a", l0: "#0c2622", l1: "#13564b" }),
  mk({ id: "sunset-ember", name: "Sunset Ember", bg: "#100610", deep: "#481630", muted: "#d0a0b8", accent: "#ff7a3d", accent2: "#ff4d8d", pink: "#ffb24d", aurora1: "#7a1d4a", aurora2: "#4a2a0f", l0: "#3a1b24", l1: "#6e2d4a" }),
  mk({ id: "vaporwave", name: "Vaporwave", bg: "#0b0820", deep: "#2a1a5e", muted: "#b8a0d8", accent: "#ff77e1", accent2: "#5ce1ff", pink: "#ff9de2", aurora1: "#5a1d8a", aurora2: "#1d4a8a", l0: "#1b1640", l1: "#3a2d8e" }),
  mk({ id: "matrix-green", name: "Matrix Green", bg: "#03100a", deep: "#0a3a22", muted: "#8fc7a0", accent: "#34e36a", accent2: "#8effb0", pink: "#b6ff5c", aurora1: "#0d6e3a", aurora2: "#1a4a2a", l0: "#0c2618", l1: "#134b2d" }),
  mk({ id: "ice-blue", name: "Ice Blue", bg: "#050b14", deep: "#143050", muted: "#9fb6ce", accent: "#59b8ff", accent2: "#7ce8ff", pink: "#b0d8ff", aurora1: "#1d4a8a", aurora2: "#0f3a55", l0: "#1b2640", l1: "#2d3a6e" }),
  mk({ id: "crimson", name: "Crimson", bg: "#120508", deep: "#4a0f1a", muted: "#d0a0a8", accent: "#ff4d5e", accent2: "#ff8a3d", pink: "#ff7a9d", aurora1: "#7a1d2a", aurora2: "#4a1a0f", l0: "#3a1b1f", l1: "#6e2d34" }),
  mk({ id: "gold-noir", name: "Gold Noir", bg: "#0e0c06", deep: "#3a2f10", muted: "#cec0a0", accent: "#f5c542", accent2: "#ffd98a", pink: "#ffe6a3", aurora1: "#6e5a1d", aurora2: "#3a3010", l0: "#2a2410", l1: "#4b3f1a" }),
  mk({ id: "synthwave", name: "Synthwave", bg: "#0a0618", deep: "#3a1a5e", muted: "#c0a0d8", accent: "#ff5c9d", accent2: "#2ee6ff", pink: "#ff8ad6", aurora1: "#6e1d7a", aurora2: "#1d3a8a", l0: "#1f1640", l1: "#3a2d6e" }),
  mk({ id: "mono-slate", name: "Mono Slate", bg: "#0b0d12", deep: "#232a38", muted: "#9fa8bc", accent: "#8aa0c8", accent2: "#b0c0e0", pink: "#c8d4ee", aurora1: "#2a3550", aurora2: "#1a2438", l0: "#1b2230", l1: "#2d3850" }),
];

/**
 * Resolve the theme vars to serve for a given page. Always returns a full set
 * (preset values merged over the default) so a partial theme never leaves a
 * page half-skinned. Pure.
 */
export function resolveTheme(settings: Settings | null, page: string): ThemeVars {
  const base: ThemeVars = { ...DEFAULT_THEME.vars };
  const t = settings?.theme;
  if (!t) return base;
  const p = (PAGES as string[]).includes(page) ? (page as Page) : "overlay";
  const chosen = t.sync === false ? (t.perPage?.[p] ?? t.shared) : t.shared;
  return { ...base, ...validateVars(chosen) };
}
