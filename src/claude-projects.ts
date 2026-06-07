import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";

/**
 * Tokens-by-project from Claude Code transcripts (PRD §17 V2). ccusage has no
 * project dimension, but the JSONL transcripts under ~/.claude/projects/ carry a
 * `cwd` per line, so we sum usage and group by project. This reads ALL Claude
 * usage, not just VibeLog sessions — answering "what did I spend tokens on?".
 */

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

export type UsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type ProjectTokens = {
  project: string; // basename of the cwd
  cwd: string;
  tokens: number;
  sessions: number; // distinct transcript files
};

export type Row = {
  cwd: string;
  file: string;
  usage: UsageLike;
  id?: string;
  requestId?: string;
  timestamp?: string; // ISO
};

/** Sum the four token kinds from a usage object. */
export function sumUsage(u: UsageLike | undefined | null): number {
  if (!u) return 0;
  return (
    (u.input_tokens ?? 0) +
    (u.output_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0)
  );
}

/**
 * Pure aggregation: group rows by cwd, dedupe by `id:requestId` (same scheme
 * ccusage uses to avoid double-counting), optionally filter by `since` date
 * (YYYY-MM-DD, inclusive, compared against the UTC date of each timestamp).
 */
export function aggregate(rows: Row[], since?: string | null): ProjectTokens[] {
  const byCwd = new Map<string, { tokens: number; files: Set<string> }>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (since && row.timestamp && row.timestamp.slice(0, 10) < since) continue;
    const key = `${row.id ?? ""}:${row.requestId ?? ""}`;
    if (key !== ":" && seen.has(key)) continue;
    if (key !== ":") seen.add(key);

    const entry = byCwd.get(row.cwd) ?? { tokens: 0, files: new Set<string>() };
    entry.tokens += sumUsage(row.usage);
    entry.files.add(row.file);
    byCwd.set(row.cwd, entry);
  }

  return [...byCwd.entries()]
    .map(([cwd, e]) => ({
      project: path.basename(cwd) || cwd,
      cwd,
      tokens: e.tokens,
      sessions: e.files.size,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Human labels for a set of cwds: the shortest trailing path suffix that is
 * unique among them (so `/a/tube-vault/extension` and
 * `/b/tube-vault/extension` become `a/tube-vault/extension` etc.).
 */
export function labelProjects(cwds: string[]): Map<string, string> {
  const segs = new Map(cwds.map((c) => [c, c.split("/").filter(Boolean)] as const));
  const out = new Map<string, string>();
  for (const cwd of cwds) {
    const s = segs.get(cwd)!;
    let label = s[s.length - 1] ?? cwd;
    for (let k = 1; k <= s.length; k++) {
      const cand = s.slice(s.length - k).join("/");
      const collides = cwds.some(
        (o) => o !== cwd && segs.get(o)!.slice(segs.get(o)!.length - k).join("/") === cand,
      );
      label = cand;
      if (!collides) break;
    }
    out.set(cwd, label);
  }
  return out;
}

async function* readJsonl(file: string): AsyncGenerator<unknown> {
  const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // skip malformed lines
    }
  }
}

/** Read all transcripts and aggregate tokens by project. */
export async function getTokensByProject(opts: { since?: string | null } = {}): Promise<ProjectTokens[]> {
  let dirs: string[];
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  const rows: Row[] = [];
  for (const dir of dirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let files: string[];
    try {
      files = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const file of files) {
      for await (const obj of readJsonl(path.join(dirPath, file))) {
        const o = obj as Record<string, unknown>;
        if (o.type !== "assistant") continue;
        const msg = o.message as Record<string, unknown> | undefined;
        const usage = msg?.usage as UsageLike | undefined;
        if (!usage) continue;
        rows.push({
          cwd: typeof o.cwd === "string" ? o.cwd : dir,
          file,
          usage,
          id: typeof msg?.id === "string" ? msg.id : undefined,
          requestId: typeof o.requestId === "string" ? o.requestId : undefined,
          timestamp: typeof o.timestamp === "string" ? o.timestamp : undefined,
        });
      }
    }
  }

  return aggregate(rows, opts.since ?? null);
}
