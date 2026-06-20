import { localDateString } from "./ccusage.ts";
import { summarizeDay, type VibeEvent, type DaySummary } from "./report.ts";

/**
 * `vibe chart` — a GitHub-style activity heatmap + "Vibe Score", built entirely
 * from the local event log. Pure functions (summarizeRange/vibeScore/formatChart)
 * so they're easy to test; the CLI just feeds them events. No AI, no network.
 */

export type DayStat = DaySummary & { score: number };

/** Weighted daily score — rewards shipping over churn, capped per category. */
export function vibeScore(d: DaySummary): number {
  const cap = (n: number, max: number) => Math.min(n, max);
  return Math.round(
    d.features.length * 8 +
      d.bugs.length * 5 +
      d.decisions.length * 3 +
      d.polish.length * 2 +
      d.notes.length * 1 +
      cap(d.prompts, 60) * 1 +
      cap(d.tools, 400) * 0.25 +
      cap(d.activeMinutes, 480) * 0.2,
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** One DayStat per calendar day, oldest→newest, for the `days` ending at `end`. */
export function summarizeRange(events: VibeEvent[], days: number, end = new Date()): DayStat[] {
  const out: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = localDateString(addDays(end, -i));
    const summary = summarizeDay(events, date);
    out.push({ ...summary, score: vibeScore(summary) });
  }
  return out;
}

/**
 * All-time bests from the event log, PURE. Computed over a wide window of days
 * (default ~371, matching the heatmap range) so the agent can tell whether
 * "today" beats any prior day. Every value is a plain number — no titles, paths
 * or any user text leak out, so the caller can derive a public-safe badge from
 * these. Safe on empty input (all zeros, null `bestDay`).
 */
export type Records = {
  /** Highest single-day vibe score ever seen, and the date it happened. */
  bestDayScore: number;
  bestDayDate: string | null;
  /** Longest run of consecutive active days (vibe score > 0). */
  longestStreak: number;
};

export function records(events: VibeEvent[], days = 371, end = new Date()): Records {
  const stats = summarizeRange(events, days, end);
  let bestDayScore = 0;
  let bestDayDate: string | null = null;
  for (const s of stats) {
    if (s.score > bestDayScore) {
      bestDayScore = s.score;
      bestDayDate = s.date;
    }
  }
  return { bestDayScore, bestDayDate, longestStreak: longestStreak(stats) };
}

/** Map a score to a 0–4 intensity level, relative to the range's busiest day. */
function levelFor(score: number, max: number): number {
  if (score <= 0) return 0;
  if (max <= 0) return 1;
  return Math.min(4, 1 + Math.floor((score / max) * 3.999));
}

// Brand-tinted heatmap (truecolor): empty → teal/purple gradient.
const SWATCH = [
  "\x1b[38;2;38;44;64m",    // 0 empty
  "\x1b[38;2;30;90;82m",    // 1
  "\x1b[38;2;34;160;128m",  // 2
  "\x1b[38;2;90;120;230m",  // 3
  "\x1b[38;2;150;120;255m", // 4
];
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

/** Trailing run of days (ending at the most recent) with any activity. */
export function currentStreak(stats: DayStat[]): number {
  let n = 0;
  for (let i = stats.length - 1; i >= 0; i--) {
    if (stats[i]!.score > 0) n++;
    else break;
  }
  return n;
}

function longestStreak(stats: DayStat[]): number {
  let best = 0;
  let run = 0;
  for (const s of stats) {
    if (s.score > 0) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Render the heatmap + summary to a colored, multi-line string. Pure. */
export function formatChart(stats: DayStat[]): string {
  if (!stats.length) return "No activity yet — run `vibe start` and ship something ✨";

  // Pad the front so the grid starts on a Sunday (GitHub-style week columns).
  const first = new Date(stats[0]!.date + "T00:00:00");
  const padFront = first.getDay(); // 0 = Sunday
  const cells: (DayStat | null)[] = [...Array(padFront).fill(null), ...stats];
  while (cells.length % 7 !== 0) cells.push(null); // pad the tail

  const weeks = cells.length / 7;
  const max = Math.max(1, ...stats.map((s) => s.score));

  const L: string[] = [];
  L.push("📈 Vibe chart");
  L.push("");

  // 7 rows (weekday), `weeks` columns. Show every other weekday label.
  for (let row = 0; row < 7; row++) {
    const label = row % 2 === 1 ? WEEKDAYS[row]!.padEnd(4) : "    ";
    let line = `  ${DIM}${label}${RESET} `;
    for (let w = 0; w < weeks; w++) {
      const cell = cells[w * 7 + row];
      if (!cell) {
        line += "  ";
        continue;
      }
      line += SWATCH[levelFor(cell.score, max)] + "■" + RESET + " ";
    }
    L.push(line);
  }

  L.push("");
  const legend =
    `  ${DIM}less${RESET} ` +
    SWATCH.map((c) => c + "■" + RESET).join(" ") +
    ` ${DIM}more${RESET}`;
  L.push(legend);

  // ---- summary -------------------------------------------------------------
  const active = stats.filter((s) => s.score > 0).length;
  const totalFeatures = stats.reduce((n, s) => n + s.features.length, 0);
  const totalBugs = stats.reduce((n, s) => n + s.bugs.length, 0);
  const totalMins = stats.reduce((n, s) => n + s.activeMinutes, 0);
  const totalScore = stats.reduce((n, s) => n + s.score, 0);
  const avgActive = active ? Math.round(totalScore / active) : 0;
  const best = stats.reduce((b, s) => (s.score > b.score ? s : b), stats[0]!);
  const hours = Math.round(totalMins / 60);

  L.push("");
  L.push(
    `  🔥 ${currentStreak(stats)}-day streak` +
      `  ·  longest ${longestStreak(stats)}` +
      `  ·  ${active}/${stats.length} active days`,
  );
  L.push(
    `  ✨ ${totalFeatures} shipped` +
      `  ·  🐛 ${totalBugs} fixed` +
      `  ·  ⏱ ${hours}h coded` +
      `  ·  ⚡ vibe score ${totalScore} (avg ${avgActive}/active day)`,
  );
  if (best.score > 0) {
    L.push(`  🏆 best day ${best.date} — ${best.score} pts`);
  }

  return L.join("\n");
}
