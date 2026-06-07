import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Best-effort Claude token total for "today" via `npx ccusage --json`.
 * V0 keeps this simple: today's grand total, not per-session attribution
 * (that's a PRD-phase-2 concern). Never throws — returns null if ccusage
 * isn't available, so the overlay just shows 0 tokens.
 */
export async function getClaudeTokensToday(): Promise<number | null> {
  try {
    const { stdout } = await exec("npx", ["--yes", "ccusage", "--json"], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    });
    const data = JSON.parse(stdout) as unknown;
    const today = localDateString();
    const rows = extractDailyRows(data);
    const row = rows.find((r) => r.date === today);
    if (!row) return 0;
    // Prefer ccusage's own total; fall back to summing the components.
    return row.total || row.input + row.output + row.cacheCreate + row.cacheRead;
  } catch {
    return null;
  }
}

/** Local YYYY-MM-DD — ccusage buckets by local date, not UTC. */
export function localDateString(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Session tokens = today's total minus the total captured at session start.
 * - First poll (baseline null): establish baseline, report 0.
 * - Normal: report today − baseline.
 * - Rollover (today < baseline, e.g. crossed midnight / ccusage reset):
 *   re-baseline to 0 and report today.
 */
export function sessionTokenDelta(
  today: number,
  baseline: number | null,
): { tokens: number; baseline: number } {
  if (baseline === null) return { tokens: 0, baseline: today };
  if (today < baseline) return { tokens: today, baseline: 0 };
  return { tokens: today - baseline, baseline };
}

type DailyRow = {
  date: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
};

/** Tolerant of ccusage output shape changes — pulls numbers by likely key names. */
function extractDailyRows(data: unknown): DailyRow[] {
  const container =
    data && typeof data === "object" && "daily" in data
      ? (data as { daily: unknown }).daily
      : data;
  if (!Array.isArray(container)) return [];
  const num = (o: Record<string, unknown>, keys: string[]): number => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number") return v;
    }
    return 0;
  };
  return container
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      date: String(r.period ?? r.date ?? ""),
      input: num(r, ["inputTokens", "input_tokens", "input"]),
      output: num(r, ["outputTokens", "output_tokens", "output"]),
      cacheCreate: num(r, ["cacheCreationTokens", "cache_creation_tokens", "cacheCreate"]),
      cacheRead: num(r, ["cacheReadTokens", "cache_read_tokens", "cacheRead"]),
      total: num(r, ["totalTokens", "total_tokens", "total"]),
    }));
}
