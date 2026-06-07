import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return out === "true";
  } catch {
    return false;
  }
}

export async function getHead(cwd: string): Promise<string | null> {
  try {
    return await git(cwd, ["rev-parse", "HEAD"]);
  } catch {
    return null; // repo with no commits yet
  }
}

export async function getBranch(cwd: string): Promise<string | null> {
  try {
    const b = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return b === "HEAD" ? null : b;
  } catch {
    return null;
  }
}

export type GitStats = {
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  commits: number;
};

/** Line count of an untracked file; 0 on any error (binary/unreadable). */
async function countLines(cwd: string, file: string): Promise<number> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const buf = await readFile(join(cwd, file));
    if (buf.includes(0)) return 0; // crude binary guard (NUL byte)
    if (buf.length === 0) return 0;
    let lines = 0;
    for (const byte of buf) if (byte === 0x0a) lines++;
    if (buf[buf.length - 1] !== 0x0a) lines++; // last line w/o trailing newline
    return lines;
  } catch {
    return 0;
  }
}

/** Sum a `git diff --numstat` block, skipping binary files ("-\t-"). */
function sumNumstat(numstat: string): { added: number; removed: number; files: Set<string> } {
  let added = 0;
  let removed = 0;
  const files = new Set<string>();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [a, r, ...rest] = line.split("\t");
    const file = rest.join("\t");
    if (a === "-" || r === "-") {
      if (file) files.add(file);
      continue;
    }
    added += Number(a) || 0;
    removed += Number(r) || 0;
    if (file) files.add(file);
  }
  return { added, removed, files };
}

/**
 * Stats since the session baseline commit: committed changes (baseline..HEAD)
 * plus everything uncommitted in the working tree (vs HEAD). If baseline is null
 * (repo had no commits at start) we count all working-tree changes vs HEAD.
 */
export async function getStats(cwd: string, baseline: string | null): Promise<GitStats> {
  const files = new Set<string>();
  let added = 0;
  let removed = 0;
  let commits = 0;

  const head = await getHead(cwd);

  if (baseline && head && baseline !== head) {
    const committed = sumNumstat(await git(cwd, ["diff", "--numstat", `${baseline}..HEAD`]));
    added += committed.added;
    removed += committed.removed;
    committed.files.forEach((f) => files.add(f));
    const count = await git(cwd, ["rev-list", "--count", `${baseline}..HEAD`]);
    commits = Number(count) || 0;
  }

  if (head) {
    // Working tree (staged + unstaged) vs HEAD — excludes untracked files.
    const dirty = sumNumstat(await git(cwd, ["diff", "--numstat", "HEAD"]));
    added += dirty.added;
    removed += dirty.removed;
    dirty.files.forEach((f) => files.add(f));
  }

  // Untracked-but-not-ignored files: count them + their line counts as added.
  // Vital for vibe coding, where brand-new files appear before any `git add`.
  const untracked = (await git(cwd, ["ls-files", "--others", "--exclude-standard"]))
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  for (const file of untracked) {
    files.add(file);
    added += await countLines(cwd, file);
  }

  return { linesAdded: added, linesRemoved: removed, filesChanged: files.size, commits };
}
