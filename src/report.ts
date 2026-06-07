import { readFile } from "node:fs/promises";
import { EVENTS_FILE } from "./config.ts";
import { localDateString } from "./ccusage.ts";
import type { LiveStats } from "./state.ts";

/**
 * `vibe report` — an end-of-session recap built entirely from local data:
 * the private event log (~/.vibelog/events.jsonl) for what happened, plus the
 * last LiveState snapshot for LOC/commit/token totals. No AI, no network.
 * Pure functions (summarizeDay/formatReport) so they're easy to test.
 */

export type VibeEvent = { ts: string; type: string; [k: string]: unknown };

export type DaySummary = {
  date: string;
  sessions: number; // session_started events
  features: string[];
  bugs: string[];
  decisions: string[];
  polish: string[];
  notes: string[];
  building: string[]; // manual `vibe building` titles, in order, deduped
  prompts: number; // Claude prompts submitted
  tools: number; // tool calls
  firstTs: string | null;
  lastTs: string | null;
  activeMinutes: number; // gap-based estimate of focused time
};

/** Gaps longer than this between events are treated as "away", not coding. */
const IDLE_GAP_MS = 15 * 60 * 1000;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Aggregate one local day's events into a recap. Pure. */
export function summarizeDay(events: VibeEvent[], date: string): DaySummary {
  const day = events
    .filter((e) => e.ts && localDateString(new Date(e.ts)) === date)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const s: DaySummary = {
    date,
    sessions: 0,
    features: [],
    bugs: [],
    decisions: [],
    polish: [],
    notes: [],
    building: [],
    prompts: 0,
    tools: 0,
    firstTs: day[0]?.ts ?? null,
    lastTs: day[day.length - 1]?.ts ?? null,
    activeMinutes: 0,
  };

  for (const e of day) {
    switch (e.type) {
      case "session_started":
        s.sessions += 1;
        break;
      case "prompt_submitted":
        s.prompts += 1;
        break;
      case "tool_used":
        s.tools += 1;
        break;
      case "now_building": {
        const t = str(e.title);
        if (t && !s.building.includes(t)) s.building.push(t);
        break;
      }
      case "mark": {
        const text = str(e.text);
        if (!text) break;
        const bucket =
          e.kind === "feature" ? s.features
          : e.kind === "bug" ? s.bugs
          : e.kind === "decision" ? s.decisions
          : e.kind === "polish" ? s.polish
          : s.notes;
        bucket.push(text);
        break;
      }
    }
  }

  let activeMs = 0;
  for (let i = 1; i < day.length; i++) {
    const gap = Date.parse(day[i]!.ts) - Date.parse(day[i - 1]!.ts);
    if (gap > 0 && gap <= IDLE_GAP_MS) activeMs += gap;
  }
  s.activeMinutes = Math.round(activeMs / 60000);

  return s;
}

function fmtNum(n: number): string {
  return n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + "M"
    : n >= 1_000
      ? (n / 1_000).toFixed(1) + "k"
      : String(n);
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Render a recap to plain text. `stats`/`project` come from the last snapshot. */
export function formatReport(
  s: DaySummary,
  stats?: LiveStats | null,
  project?: string | null,
): string {
  const L: string[] = [];
  L.push(`📊 Vibe report — ${s.date}`);
  L.push("");

  if (!s.firstTs) {
    L.push("  No activity logged today. Run `vibe start` and code something ✨");
    return L.join("\n");
  }

  const headline = [
    `⏱  ${fmtDuration(s.activeMinutes)} active`,
    `${s.sessions || 1} session${(s.sessions || 1) === 1 ? "" : "s"}`,
  ].join("  ·  ");
  L.push(`  ${headline}`);

  const counts = [
    `✨ ${s.features.length} feature${s.features.length === 1 ? "" : "s"}`,
    `🐛 ${s.bugs.length} fix${s.bugs.length === 1 ? "" : "es"}`,
    `💬 ${s.prompts} prompt${s.prompts === 1 ? "" : "s"}`,
    `🔧 ${s.tools} tool call${s.tools === 1 ? "" : "s"}`,
  ].join("  ·  ");
  L.push(`  ${counts}`);

  if (stats) {
    L.push("");
    L.push(`  Code${project ? ` — ${project}` : ""}`);
    L.push(
      `    +${stats.linesAdded} / -${stats.linesRemoved} lines` +
        `  ·  ${stats.filesChanged} files` +
        `  ·  ${stats.commits} commit${stats.commits === 1 ? "" : "s"}` +
        `  ·  ${fmtNum(stats.claudeTokens)} tokens`,
    );
  }

  const section = (title: string, items: string[], icon: string) => {
    if (!items.length) return;
    L.push("");
    L.push(`  ${title}`);
    for (const it of items) L.push(`    ${icon} ${it}`);
  };
  section("Shipped", s.features, "✨");
  section("Fixed", s.bugs, "🐛");
  section("Decisions", s.decisions, "•");
  section("Polish", s.polish, "✦");
  section("Notes", s.notes, "·");

  if (s.building.length) {
    L.push("");
    L.push("  Worked on");
    for (const b of s.building) L.push(`    › ${b}`);
  }

  return L.join("\n");
}

/** Read & parse the private event log (best-effort). */
export async function readEvents(): Promise<VibeEvent[]> {
  let raw: string;
  try {
    raw = await readFile(EVENTS_FILE, "utf8");
  } catch {
    return [];
  }
  const out: VibeEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as VibeEvent;
      if (o && typeof o.ts === "string" && typeof o.type === "string") out.push(o);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}
