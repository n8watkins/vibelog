import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type DailyUsage = { tokens: number; cost: number };

const rowTokens = (r: DailyRow): number =>
  r.total || r.input + r.output + r.cacheCreate + r.cacheRead;

/**
 * Best-effort Claude usage (tokens + USD cost) for "today" via
 * `npx ccusage --json`. V0 keeps this simple: today's grand total, not
 * per-session attribution. Never throws — returns null if ccusage isn't
 * available, so the overlay just shows zeros.
 */
export async function getClaudeUsageToday(): Promise<DailyUsage | null> {
  const rows = await getDailyUsage();
  if (rows === null) return null;
  const today = localDateString();
  const row = rows.find((r) => r.date === today);
  if (!row) return { tokens: 0, cost: 0 };
  return { tokens: rowTokens(row), cost: row.cost };
}

/** All daily usage rows ccusage knows about (date → tokens/cost). Null on failure. */
export async function getDailyUsage(): Promise<DailyRow[] | null> {
  try {
    const { stdout } = await exec("npx", ["--yes", "ccusage", "--json"], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    });
    return extractDailyRows(JSON.parse(stdout) as unknown);
  } catch {
    return null;
  }
}

/** date → { tokens, cost } map for the dashboard activity chart. Null on failure. */
export async function dailyUsageMap(): Promise<Record<string, DailyUsage> | null> {
  const rows = await getDailyUsage();
  if (rows === null) return null;
  const out: Record<string, DailyUsage> = {};
  for (const r of rows) out[r.date] = { tokens: rowTokens(r), cost: r.cost };
  return out;
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
  cost: number;
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
      cost: num(r, ["totalCost", "total_cost", "costUSD", "cost"]),
    }));
}
