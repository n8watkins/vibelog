import { localDateString } from "./ccusage.ts";

/**
 * Deterministic demo data for `vibe demo`. Synthesizes a full, coherent *year*
 * of activity so /dashboard looks alive (GitHub-style) without touching ccusage
 * or the real event log. Uses the same project names the overlay ticker uses, so
 * all three surfaces (/overlay, /live, /dashboard) tell one consistent story.
 * Pure + seeded → identical every render, and easy to test.
 */

export type DayUsage = {
  tokens: number;
  cost: number;
  commits: number;
  features: number;
  /** Minutes spent live-streaming that day (day-level, not per-project). */
  stream: number;
};

export type DemoProject = {
  name: string;
  repo: string;
  blurb: string;
  tokens: number;
  cost: number;
  commits: number;
  activeDays: number;
};

/** ~Blended USD per *million* tokens (cache-heavy Claude mix). */
const COST_PER_MTOK = 1.95;
/** 53 weeks — a clean GitHub-style grid that always starts on a Sunday column. */
const DAYS = 371;

const PROJECTS = [
  { name: "VibeLog", repo: "natkins/vibelog", weight: 0.3, blurb: "Live coding overlay for streamers" },
  { name: "pooled-engine", repo: "natkins/pooled-engine", weight: 0.24, blurb: "Warm-pool GPU inference scheduler" },
  { name: "ask-me-cutely", repo: "natkins/ask-me-cutely", weight: 0.2, blurb: "Tone-shifting prompt rephraser" },
  { name: "date-planner", repo: "natkins/date-planner", weight: 0.16, blurb: "Auto itinerary builder" },
  { name: "website-template", repo: "natkins/website-template", weight: 0.1, blurb: "One-click neon portfolio" },
];

/** Small fast seeded PRNG (mulberry32) so demo renders are deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Pick `n` distinct projects weighted by their `weight`. */
function pickProjects(rng: () => number, n: number): typeof PROJECTS {
  const out: typeof PROJECTS = [];
  const pool = [...PROJECTS];
  for (let k = 0; k < n && pool.length; k++) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = rng() * total;
    let idx = 0;
    while (idx < pool.length - 1 && (r -= pool[idx]!.weight) > 0) idx++;
    out.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return out;
}

type Cell = {
  date: string;
  per: Record<string, { tokens: number; commits: number; features: number }>;
  /** Minutes live-streaming that day — the streaming dimension of the chart. */
  stream: number;
};

/**
 * Build one contiguous year of per-project daily activity. Activity ramps up
 * toward the present, dips on weekends, and has a few "vacation" gaps so the
 * calendar reads like a real human's year rather than uniform noise.
 */
function buildYear(end: Date): Cell[] {
  const rng = mulberry32(20260609);
  const cells: Cell[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    const date = localDateString(d);
    const dow = d.getDay();
    const recency = (DAYS - 1 - i) / (DAYS - 1); // 0 oldest → 1 today
    let pActive = 0.3 + recency * 0.5; // ramps 0.30 → 0.80
    if (dow === 0 || dow === 6) pActive *= 0.5; // lighter weekends
    if (Math.sin((i / DAYS) * Math.PI * 6) > 0.86) pActive *= 0.15; // vacation dead zones

    const per: Cell["per"] = {};
    const coding = rng() < pActive;
    if (coding) {
      const n = rng() < 0.4 ? 2 : 1;
      for (const p of pickProjects(rng, n)) {
        const heat = 0.4 + rng() * 3.2 + (rng() < 0.1 ? 4 + rng() * 6 : 0); // M tokens
        const tokens = Math.round(heat * (0.45 + recency) * 1e6);
        const commits = 1 + Math.floor(rng() * 6 + heat * 0.5);
        const features = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
        per[p.name] = { tokens, commits, features };
      }
    }

    // Streaming: shows up to go live most coding days (and occasionally without
    // coding), more so recently and on Thu–Sun. A session runs ~1–5h.
    let stream = 0;
    let pStream = (coding ? 0.62 : 0.1) * (0.55 + recency);
    if (dow >= 4 || dow === 0) pStream *= 1.25; // Thu/Fri/Sat/Sun heavier
    if (rng() < pStream) stream = 60 + Math.round(rng() * 180) + (rng() < 0.18 ? 120 : 0);

    cells.push({ date, per, stream });
  }
  return cells;
}

// Rebuild only when the day rolls over (the year is anchored to "today").
let cache: { day: string; year: Cell[] } | null = null;
function year(end: Date): Cell[] {
  const day = localDateString(end);
  if (!cache || cache.day !== day) cache = { day, year: buildYear(end) };
  return cache.year;
}

export function demoProjects(end = new Date()): DemoProject[] {
  const cells = year(end);
  return PROJECTS.map((p) => {
    let tokens = 0;
    let commits = 0;
    let activeDays = 0;
    for (const c of cells) {
      const x = c.per[p.name];
      if (x) {
        tokens += x.tokens;
        commits += x.commits;
        activeDays++;
      }
    }
    return {
      name: p.name,
      repo: p.repo,
      blurb: p.blurb,
      tokens,
      cost: +((tokens / 1e6) * COST_PER_MTOK).toFixed(2),
      commits,
      activeDays,
    };
  });
}

export type DemoDashboard = {
  usageByDay: Record<string, DayUsage>;
  chart: { date: string; features: string[]; bugs: string[] }[];
  projects: DemoProject[];
  activeProject: string | null;
};

/**
 * One dashboard payload: `days` of history (e.g. 31 month, 371 year), optionally
 * scoped to a single `project`. usageByDay covers every day in range (zeros
 * included) so the heatmap grid stays contiguous.
 */
export function demoDashboard(opts: { days: number; project: string | null; end?: Date }): DemoDashboard {
  const end = opts.end ?? new Date();
  const cells = year(end);
  const slice = cells.slice(Math.max(0, cells.length - opts.days));
  const proj = opts.project && opts.project !== "all" ? opts.project : null;

  const usageByDay: Record<string, DayUsage> = {};
  const chart: DemoDashboard["chart"] = [];
  for (const c of slice) {
    let tokens = 0;
    let commits = 0;
    let features = 0;
    for (const [name, x] of Object.entries(c.per)) {
      if (proj && name !== proj) continue;
      tokens += x.tokens;
      commits += x.commits;
      features += x.features;
    }
    usageByDay[c.date] = {
      tokens,
      cost: +((tokens / 1e6) * COST_PER_MTOK).toFixed(2),
      commits,
      features,
      stream: c.stream,
    };
    chart.push({ date: c.date, features: Array(features).fill("f"), bugs: [] });
  }
  return { usageByDay, chart, projects: demoProjects(end), activeProject: proj };
}

/** A plausible "this week" rollup derived from the last 7 days of the year. */
export function demoWeek(end = new Date()) {
  const last7 = year(end).slice(-7);
  const days = last7.map((c) => {
    let features = 0;
    let commits = 0;
    const active = Object.keys(c.per).length > 0;
    for (const x of Object.values(c.per)) {
      features += x.features;
      commits += x.commits;
    }
    return {
      date: c.date,
      activeMinutes: active ? 55 + Math.round(commits * 22) : 0,
      firstTs: active || c.stream > 0 ? c.date + "T10:00:00Z" : null,
      features: Array(features).fill("f"),
      bugs: [] as string[],
      stream: c.stream,
    };
  });
  return {
    days,
    activeDays: days.filter((d) => d.firstTs).length,
    features: days.flatMap((d) => d.features),
    bugs: [] as string[],
    activeMinutes: days.reduce((s, d) => s + d.activeMinutes, 0),
    streamMinutes: days.reduce((s, d) => s + d.stream, 0),
    start: days[0]?.date ?? "",
    end: days[6]?.date ?? "",
  };
}

/** A plausible "today" summary consistent with the demo year's last day. */
export function demoToday(end = new Date()) {
  const d = demoWeek(end).days.at(-1)!;
  return {
    date: d.date,
    activeMinutes: d.activeMinutes,
    features: d.features,
    bugs: d.bugs,
    prompts: 18 + Math.round(d.activeMinutes / 12),
    tools: 0,
    sessions: 1,
    decisions: [] as string[],
    polish: [] as string[],
    notes: [] as string[],
    building: [] as string[],
  };
}
