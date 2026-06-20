import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadState, buildThemePatch } from "./mcp.ts";
import { emptyState } from "./state.ts";
import type { Theme } from "./theme.ts";

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

// ---------------------------------------------------------------------------
// buildThemePatch — the pure payload builder behind the set_theme write tool
// ---------------------------------------------------------------------------

const PRESETS_FIXTURE: Theme[] = [
  { id: "synthwave", name: "Synthwave", vars: { "--accent": "#ff5c9d", "--bg": "#0a0618" } },
  { id: "ice-blue", name: "Ice Blue", vars: { "--accent": "#59b8ff" } },
];

test("buildThemePatch applies a known preset (full replace + presetId)", () => {
  const out = buildThemePatch({ preset: "synthwave" }, PRESETS_FIXTURE, { "--accent": "#000000" });
  assert.equal(out.presetId, "synthwave");
  assert.equal(out.shared["--accent"], "#ff5c9d");
  assert.equal(out.shared["--bg"], "#0a0618");
});

test("buildThemePatch throws on an unknown preset (lists the valid ids)", () => {
  assert.throws(
    () => buildThemePatch({ preset: "nope" }, PRESETS_FIXTURE, {}),
    /Unknown preset "nope".*synthwave, ice-blue/,
  );
});

test("buildThemePatch merges vars over the current shared theme (preserves the rest)", () => {
  const out = buildThemePatch({ vars: { "--accent": "#ff8800" } }, PRESETS_FIXTURE, { "--accent": "#000", "--bg": "#111" });
  assert.equal(out.shared["--accent"], "#ff8800"); // overridden
  assert.equal(out.shared["--bg"], "#111");          // preserved
  assert.equal(out.presetId, undefined);              // no preset → no id
});

test("buildThemePatch with preset + vars yields a customized look (presetId cleared)", () => {
  const out = buildThemePatch({ preset: "synthwave", vars: { "--accent": "#ffffff" } }, PRESETS_FIXTURE, {});
  assert.equal(out.shared["--accent"], "#ffffff");   // var wins over preset
  assert.equal(out.shared["--bg"], "#0a0618");        // rest of preset kept
  assert.equal(out.presetId, undefined);              // no longer "that preset"
});
