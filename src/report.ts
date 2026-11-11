import { readFile } from "node:fs/promises";
import { EVENTS_FILE } from "./config.ts";
import { localDateString } from "./usage.ts";
import { formatTokens } from "./format.ts";
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


function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** "today", "yesterday" or "on YYYY-MM-DD" for `date`, seen from `today`. */
function dayPhrase(date: string, today: string): string {
  if (date === today) return "today";
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return date === localDateString(d) ? "yesterday" : `on ${date}`;
}

/** Render a recap to plain text. `stats`/`project` come from the last snapshot. */
export function formatReport(
  s: DaySummary,
  stats?: LiveStats | null,
  project?: string | null,
  today: string = localDateString(),
): string {
  const L: string[] = [];
  L.push(`📊 Vibe report — ${s.date}`);
  L.push("");

  if (!s.firstTs) {
    L.push(`  No activity logged ${dayPhrase(s.date, today)}. Run \`vibe start\` and code something ✨`);
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
        `  ·  ${formatTokens(stats.claudeTokens)} tokens`,
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

// ---- weekly rollup --------------------------------------------------------

export type WeekSummary = {
  days: DaySummary[]; // oldest → newest, exactly 7
  start: string;
  end: string;
  activeDays: number;
  sessions: number;
  prompts: number;
  tools: number;
  features: string[];
  bugs: string[];
  decisions: string[];
  activeMinutes: number;
};

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return localDateString(d);
}

/** Roll up the 7 local days ending on `endDate` (inclusive). Pure. */
export function summarizeWeek(events: VibeEvent[], endDate: string): WeekSummary {
  const days: DaySummary[] = [];
  for (let i = 6; i >= 0; i--) days.push(summarizeDay(events, shiftDate(endDate, -i)));
  const w: WeekSummary = {
    days,
    start: days[0]!.date,
    end: days[6]!.date,
    activeDays: 0,
    sessions: 0,
    prompts: 0,
    tools: 0,
    features: [],
    bugs: [],
    decisions: [],
    activeMinutes: 0,
  };
  for (const d of days) {
    if (d.firstTs) w.activeDays += 1;
    w.sessions += d.sessions;
    w.prompts += d.prompts;
    w.tools += d.tools;
    w.activeMinutes += d.activeMinutes;
    w.features.push(...d.features);
    w.bugs.push(...d.bugs);
    w.decisions.push(...d.decisions);
  }
  return w;
}

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Render a weekly recap to plain text. Pure. */
export function formatWeekly(w: WeekSummary): string {
  const L: string[] = [];
  L.push(`🗓  Vibe week — ${w.start} → ${w.end}`);
  L.push("");

  if (!w.activeDays) {
    L.push("  No activity logged this week. Run `vibe start` and ship something ✨");
    return L.join("\n");
  }

  const maxMins = Math.max(1, ...w.days.map((d) => d.activeMinutes));
  for (const d of w.days) {
    const dow = DOW[new Date(d.date + "T00:00:00").getDay()]!;
    const bar = "█".repeat(Math.round((d.activeMinutes / maxMins) * 18));
    const tail = d.firstTs
      ? `${fmtDuration(d.activeMinutes).padStart(7)}  ✨${d.features.length} 🐛${d.bugs.length}`
      : `${"—".padStart(7)}`;
    L.push(`  ${dow} ${d.date.slice(5)}  ${bar.padEnd(18)}  ${tail}`);
  }

  L.push("");
  L.push(
    `  ${w.activeDays}/7 active days  ·  ${w.sessions} session${w.sessions === 1 ? "" : "s"}` +
      `  ·  ⏱ ${fmtDuration(w.activeMinutes)} total`,
  );
  L.push(
    `  ✨ ${w.features.length} shipped  ·  🐛 ${w.bugs.length} fixed` +
      `  ·  💬 ${w.prompts} prompts  ·  🔧 ${w.tools} tool calls`,
  );

  const section = (title: string, items: string[], icon: string) => {
    if (!items.length) return;
    L.push("");
    L.push(`  ${title}`);
    for (const it of items) L.push(`    ${icon} ${it}`);
  };
  section("Shipped this week", w.features, "✨");
  section("Fixed this week", w.bugs, "🐛");
  section("Decisions", w.decisions, "•");

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
