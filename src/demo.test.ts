/**
 * End-to-end: run the real `vibe demo` CLI against a throwaway HOME and drive
 * it over HTTP. Proves two owner requirements against the actual server:
 *  1. demo mode never writes ~/.vibelog/state.json, session.json or events.jsonl
 *  2. dollar spend is hidden from public /state.json by default (decided
 *     2026-11-01), visible to the local HUD, and restored by publicShowCost.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let home = "";
let port = 0;
let child: ChildProcess | null = null;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const p = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(p));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`demo agent did not start at ${url}`);
}

const base = () => `http://127.0.0.1:${port}`;
const getState = async (q = "", headers: Record<string, string> = {}) =>
  (await (await fetch(`${base()}/state.json${q}`, { headers })).json()) as { stats: Record<string, unknown> };

before(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "vibelog-demo-"));
  port = await freePort();
  child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "demo", "--port", String(port)], {
    cwd: ROOT,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: "ignore",
  });
  await waitForServer(`${base()}/state.json`);
});

after(async () => {
  child?.kill("SIGKILL");
  await rm(home, { recursive: true, force: true });
});

test("demo mode never writes the real state, session or event log", async () => {
  // Exercise every write path the demo can reach: the render loop, a mark
  // (session + event log) and a now-building update.
  await fetch(`${base()}/mark`, { method: "POST", body: JSON.stringify({ kind: "feature", text: "demo mark" }) });
  await fetch(`${base()}/building`, { method: "POST", body: JSON.stringify({ title: "demo building" }) });
  await new Promise((r) => setTimeout(r, 2500)); // let the 2s demo tick render
  const dir = path.join(home, ".vibelog");
  const files = await readdir(dir).catch(() => [] as string[]);
  for (const f of ["state.json", "session.json", "events.jsonl"]) {
    assert.equal(files.includes(f), false, `demo wrote ${f}`);
  }
});

test("public /state.json hides dollar spend by default but keeps tokens", async () => {
  const s = await getState();
  assert.equal("costUsd" in s.stats, false);
  assert.ok(Number(s.stats.claudeTokens) > 0);
});

test("the local HUD (?hud=1) still sees dollar spend", async () => {
  const s = await getState("?hud=1");
  assert.equal(typeof s.stats.costUsd, "number");
});

test("a tunneled caller cannot unlock spend with ?hud=1", async () => {
  const s = await getState("?hud=1", { "cf-connecting-ip": "203.0.113.9" });
  assert.equal("costUsd" in s.stats, false);
});

test("publicShowCost: true restores spend on the public surface", async () => {
  const dir = path.join(home, ".vibelog");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "settings.json"),
    JSON.stringify({ version: 1, theme: { sync: true, shared: {} }, publicShowCost: true }),
  );
  const s = await getState("", { "cf-connecting-ip": "203.0.113.9" });
  assert.equal(typeof s.stats.costUsd, "number");
});
