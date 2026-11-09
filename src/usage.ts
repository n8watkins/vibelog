import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { costOf, type TokenUsage } from "./pricing.ts";

/**
 * Claude usage (tokens + estimated USD) computed locally from Claude Code's
 * JSONL transcripts. No network and no third-party code: this replaced a
 * `npx --yes ccusage --json` call that fetched and ran an unpinned package on
 * every 30-second poll.
 *
 * Transcripts are append-only, so the index keeps a byte offset per file and
 * only parses what was appended since the last refresh. The first refresh
 * reads everything once; later ones read a few new lines. Messages are
 * de-duplicated by `message.id:requestId` (resumed sessions repeat history),
 * the same rule ccusage uses.
 */

export type DailyUsage = { tokens: number; cost: number };

/** Where Claude Code keeps transcripts (both locations ccusage reads). */
export function defaultTranscriptRoots(home = os.homedir()): string[] {
  return [path.join(home, ".config", "claude", "projects"), path.join(home, ".claude", "projects")];
}

/** Every *.jsonl under the roots, recursively (sub-agent transcripts live in nested folders). */
export async function transcriptFiles(roots: string[] = defaultTranscriptRoots()): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 6) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
    }
  }
  for (const r of roots) await walk(r, 0);
  return out;
}

/** One de-duplicated assistant message with usage. */
export type UsageEntry = {
  /** `message.id:requestId`, or null when the line has neither. */
  key: string | null;
  cwd: string;
  /** Local YYYY-MM-DD of the message timestamp, or null when it has none. */
  date: string | null;
  model?: string;
  usage: TokenUsage;
};

/** Total tokens of one usage object (input + output + cache write + cache read). */
export function sumTokens(u: TokenUsage | undefined | null): number {
  if (!u) return 0;
  return (
    (u.input_tokens ?? 0) +
    (u.output_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0)
  );
}

/** Parse one transcript line into a usage entry, or null when it carries none. Pure. */
export function parseLine(line: string, fallbackCwd: string): UsageEntry | null {
  // Cheap pre-filter: most bytes in a transcript are tool output without usage.
  if (!line.includes('"usage"') || !line.includes('"assistant"')) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (o.type !== "assistant") return null;
  const msg = o.message as Record<string, unknown> | undefined;
  const usage = msg?.usage as TokenUsage | undefined;
  if (!usage || typeof usage !== "object") return null;
  const id = typeof msg?.id === "string" ? msg.id : "";
  const req = typeof o.requestId === "string" ? o.requestId : "";
  const ts = typeof o.timestamp === "string" ? new Date(o.timestamp) : null;
  return {
    key: id || req ? `${id}:${req}` : null,
    cwd: typeof o.cwd === "string" ? o.cwd : fallbackCwd,
    date: ts && !Number.isNaN(ts.getTime()) ? localDateString(ts) : null,
    model: typeof msg?.model === "string" ? msg.model : undefined,
    usage,
  };
}

/** The project folder name a transcript belongs to (sub-agent files sit two levels deeper). */
export function projectDirOf(file: string): string {
  const parts = file.split(path.sep);
  const sub = parts.lastIndexOf("subagents");
  return sub >= 2 ? parts[sub - 2]! : (parts[parts.length - 2] ?? "");
}

type FileState = { offset: number; ino: number };

/**
 * Incremental per-day usage built from transcripts. Not thread-safe by design:
 * concurrent refresh() calls share one in-flight promise.
 */
export class UsageIndex {
  private files = new Map<string, FileState>();
  private seen = new Set<string>();
  private byDay: Record<string, DailyUsage> = {};
  private byCwdDay: Record<string, Record<string, number>> = {};
  private inflight: Promise<void> | null = null;

  constructor(private readonly roots: string[] = defaultTranscriptRoots()) {}

  /** Read whatever was appended since the last refresh. Never throws. */
  refresh(): Promise<void> {
    this.inflight ??= this.doRefresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** date -> { tokens, cost } across all projects. */
  daily(): Record<string, DailyUsage> {
    return structuredClone(this.byDay);
  }

  /** cwd -> { date -> tokens }. */
  dailyByCwd(): Record<string, Record<string, number>> {
    return structuredClone(this.byCwdDay);
  }

  private reset(): void {
    this.files.clear();
    this.seen.clear();
    this.byDay = {};
    this.byCwdDay = {};
  }

  private add(e: UsageEntry): void {
    if (e.key) {
      if (this.seen.has(e.key)) return;
      this.seen.add(e.key);
    }
    if (!e.date) return;
    const tokens = sumTokens(e.usage);
    const day = (this.byDay[e.date] ??= { tokens: 0, cost: 0 });
    day.tokens += tokens;
    day.cost += costOf(e.model, e.usage);
    const cwd = (this.byCwdDay[e.cwd] ??= {});
    cwd[e.date] = (cwd[e.date] ?? 0) + tokens;
  }

  private async doRefresh(): Promise<void> {
    try {
      const files = await transcriptFiles(this.roots);
      const stats = new Map<string, { size: number; ino: number }>();
      for (const f of files) {
        try {
          const s = await stat(f);
          stats.set(f, { size: s.size, ino: s.ino });
        } catch {
          // vanished between readdir and stat
        }
      }
      // A file that shrank, was replaced or deleted means the totals no longer
      // match the disk: rebuild from scratch (rare; transcripts only grow).
      let rebuild = false;
      for (const [f, st] of this.files) {
        const now = stats.get(f);
        if (!now || now.size < st.offset || now.ino !== st.ino) rebuild = true;
      }
      if (rebuild) this.reset();
      for (const [f, s] of stats) {
        const prev = this.files.get(f);
        const offset = prev?.offset ?? 0;
        if (s.size <= offset) continue;
        const consumed = await this.readFrom(f, offset, s.size);
        this.files.set(f, { offset: offset + consumed, ino: s.ino });
      }
    } catch {
      // keep the last good totals
    }
  }

  /** Parse complete lines in [start, end); return the bytes consumed (up to the last newline). */
  private async readFrom(file: string, start: number, end: number): Promise<number> {
    const fallbackCwd = projectDirOf(file);
    let consumed = 0;
    let carry: Buffer = Buffer.alloc(0);
    const stream = createReadStream(file, { start, end: end - 1 });
    for await (const chunk of stream) {
      let buf = carry.length ? Buffer.concat([carry, chunk as Buffer]) : (chunk as Buffer);
      let nl: number;
      while ((nl = buf.indexOf(10)) !== -1) {
        const line = buf.subarray(0, nl).toString("utf8");
        consumed += nl + 1;
        buf = buf.subarray(nl + 1);
        const e = parseLine(line, fallbackCwd);
        if (e) this.add(e);
      }
      carry = Buffer.from(buf);
    }
    // A trailing partial line is left for the next refresh, once it is complete.
    return consumed;
  }
}

let shared: UsageIndex | null = null;
/** The process-wide index over the default transcript folders. */
export function usageIndex(): UsageIndex {
  return (shared ??= new UsageIndex());
}

/**
 * Today's Claude usage (all projects): tokens + estimated USD. Returns null only
 * if reading fails outright, so the overlay keeps its last values.
 */
export async function getClaudeUsageToday(): Promise<DailyUsage | null> {
  const idx = usageIndex();
  await idx.refresh();
  return idx.daily()[localDateString()] ?? { tokens: 0, cost: 0 };
}

/** date -> { tokens, cost } map for the dashboard activity chart. */
export async function dailyUsageMap(): Promise<Record<string, DailyUsage> | null> {
  const idx = usageIndex();
  await idx.refresh();
  return idx.daily();
}

/** Local YYYY-MM-DD (usage is bucketed by local date, not UTC). */
export function localDateString(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Session tokens = today's total minus the total captured at session start.
 * - First poll (baseline null): establish baseline, report 0.
 * - Normal: report today − baseline.
 * - Rollover (today < baseline, e.g. crossed midnight):
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
