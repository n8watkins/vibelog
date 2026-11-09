#!/usr/bin/env node
/**
 * Copy the pages the public Worker serves from public/ into worker/public/.
 *
 *   node scripts/sync-worker-public.mjs          copy (run before every deploy;
 *                                                `npm --prefix worker run deploy` does it)
 *   node scripts/sync-worker-public.mjs --check  exit 1 if a copy is stale or a
 *                                                stray file is present (CI)
 *
 * worker/public/ must hold exactly these files: the Worker serves every file in
 * it, so anything else (an old landing page, screenshots) would be public too.
 */
import { copyFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKER_FILES = ["live.html", "embed.html", "embed.js"];

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public");
const DEST = path.join(ROOT, "worker", "public");

/** Problems that make worker/public/ differ from what it should be. */
export function drift() {
  const problems = [];
  for (const f of WORKER_FILES) {
    let copy = null;
    try {
      copy = readFileSync(path.join(DEST, f));
    } catch {
      problems.push(`missing worker/public/${f}`);
      continue;
    }
    if (!copy.equals(readFileSync(path.join(SRC, f)))) problems.push(`stale worker/public/${f}`);
  }
  for (const f of readdirSync(DEST)) {
    if (!WORKER_FILES.includes(f)) {
      problems.push(`unexpected worker/public/${f}${statSync(path.join(DEST, f)).isDirectory() ? "/" : ""}`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const problems = drift();
    if (problems.length) {
      console.error(problems.map((p) => `- ${p}`).join("\n"));
      console.error("Run: node scripts/sync-worker-public.mjs (and remove unexpected files)");
      process.exit(1);
    }
    console.log("worker/public is in sync with public/");
  } else {
    for (const f of WORKER_FILES) copyFileSync(path.join(SRC, f), path.join(DEST, f));
    const extra = drift();
    if (extra.length) {
      console.error(extra.map((p) => `- ${p}`).join("\n"));
      process.exit(1);
    }
    console.log(`synced ${WORKER_FILES.join(", ")} into worker/public/`);
  }
}
