import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadState } from "./mcp.ts";
import { emptyState } from "./state.ts";

// An almost-certainly-unused port so the "agent" fetch fails fast and we
// exercise the disk-fallback / no-state branches deterministically (no live
// server required).
const DEAD_PORT = 49231;

test("loadState falls back to the cached file when the agent is unreachable", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vibelog-mcp-"));
  const stateFile = path.join(dir, "state.json");
  const snapshot = { ...emptyState(), isLive: true, branch: "main" };
  await writeFile(stateFile, JSON.stringify(snapshot));
  try {
    const result = await loadState({ port: DEAD_PORT, stateFile, timeoutMs: 200 });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.source, "file");
    assert.equal(result.ok && result.state.branch, "main");
    assert.equal(result.ok && result.state.isLive, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadState returns a clear message when there is no agent and no cache", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vibelog-mcp-"));
  const stateFile = path.join(dir, "does-not-exist.json");
  try {
    const result = await loadState({ port: DEAD_PORT, stateFile, timeoutMs: 200 });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.message, /vibe start/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
