#!/usr/bin/env node
/**
 * VibeLog Claude Code hook — the "dumb" half (PRD §16.3).
 *
 * Reads the hook event JSON from stdin and forwards it to the running VibeLog
 * agent. It is intentionally minimal: it MUST be fast, MUST NOT write to stdout
 * (UserPromptSubmit stdout is injected into Claude's context), and MUST exit 0
 * even when the agent isn't running — so it never interferes with Claude.
 *
 * Usage (wired via settings.json):  node claude-hook.mjs <prompt|tool|stop>
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const event = process.argv[2] || "prompt";

let data = {};
try {
  const raw = readFileSync(0, "utf8");
  if (raw) data = JSON.parse(raw);
} catch {
  // no/invalid stdin — forward an empty object
}

/** True when a process with this pid exists (EPERM: it exists, owned by someone else). */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

let port = 4545;
try {
  const session = JSON.parse(
    readFileSync(path.join(os.homedir(), ".vibelog", "session.json"), "utf8"),
  );
  // A session whose agent has died (no `vibe end`) is no session: send nothing.
  if (typeof session.pid === "number" && !pidAlive(session.pid)) process.exit(0);
  if (session.port) port = session.port;
} catch {
  // no active session — agent likely not running; we'll just fail the fetch
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 800);
try {
  await fetch(`http://127.0.0.1:${port}/hooks/claude/${event}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  });
} catch {
  // agent down / timed out — ignore, never block Claude
} finally {
  clearTimeout(timer);
}

process.exit(0);
