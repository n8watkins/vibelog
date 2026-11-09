import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionTokenDelta } from "./usage.ts";

test("first poll establishes baseline and reports 0", () => {
  assert.deepEqual(sessionTokenDelta(5000, null), { tokens: 0, baseline: 5000 });
});

test("reports today minus baseline during a session", () => {
  assert.deepEqual(sessionTokenDelta(8200, 5000), { tokens: 3200, baseline: 5000 });
});

test("no growth yet → 0 tokens, baseline unchanged", () => {
  assert.deepEqual(sessionTokenDelta(5000, 5000), { tokens: 0, baseline: 5000 });
});

test("midnight rollover re-baselines to 0 and counts the new day", () => {
  assert.deepEqual(sessionTokenDelta(120, 5000), { tokens: 120, baseline: 0 });
});

import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UsageIndex, localDateString, parseLine, projectDirOf } from "./usage.ts";

const TS = "2026-11-09T12:00:00.000Z";
const DAY = localDateString(new Date(TS));
const line = (id: string, req: string, tokens: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "assistant",
    cwd: "/work/demo",
    requestId: req,
    timestamp: TS,
    message: { id, model: "claude-opus-5-5", usage: { input_tokens: tokens, output_tokens: 0 } },
    ...extra,
  }) + "\n";

test("parseLine reads usage lines and skips everything else", () => {
  assert.equal(parseLine('{"type":"user","message":{"content":"hi"}}', "x"), null);
  assert.equal(parseLine("not json with \"usage\" and \"assistant\"", "x"), null);
  const e = parseLine(line("m1", "r1", 10).trim(), "x");
  assert.equal(e?.key, "m1:r1");
  assert.equal(e?.cwd, "/work/demo");
  assert.equal(e?.date, DAY);
  assert.equal(e?.model, "claude-opus-5-5");
});

test("projectDirOf finds the project folder for top-level and sub-agent transcripts", () => {
  assert.equal(projectDirOf("/r/-home-me-app/abc.jsonl"), "-home-me-app");
  assert.equal(projectDirOf("/r/-home-me-app/abc/subagents/agent-1.jsonl"), "-home-me-app");
});

test("UsageIndex reads nested transcripts, de-duplicates, and only parses appended lines", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vibelog-usage-"));
  try {
    const proj = path.join(root, "-work-demo");
    await mkdir(path.join(proj, "s1", "subagents"), { recursive: true });
    const main = path.join(proj, "s1.jsonl");
    await writeFile(main, line("m1", "r1", 100) + line("m2", "r2", 50));
    // A sub-agent transcript, plus a resumed copy of m1 that must not count twice.
    await writeFile(path.join(proj, "s1", "subagents", "agent-a.jsonl"), line("m3", "r3", 7) + line("m1", "r1", 100));

    const idx = new UsageIndex([root]);
    await idx.refresh();
    assert.equal(idx.daily()[DAY]?.tokens, 157);
    assert.equal(+idx.daily()[DAY]!.cost.toFixed(6), +((157 * 4) / 1e6).toFixed(6));
    assert.deepEqual(idx.dailyByCwd(), { "/work/demo": { [DAY]: 157 } });

    // A half-written line is held back until it is complete.
    const next = line("m4", "r4", 3);
    await appendFile(main, next.slice(0, 20));
    await idx.refresh();
    assert.equal(idx.daily()[DAY]?.tokens, 157);
    await appendFile(main, next.slice(20));
    await idx.refresh();
    assert.equal(idx.daily()[DAY]?.tokens, 160);

    // A rewritten (shorter) file triggers a clean rebuild.
    await writeFile(main, line("m1", "r1", 100));
    await idx.refresh();
    assert.equal(idx.daily()[DAY]?.tokens, 107);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("UsageIndex over a missing folder reports nothing and does not throw", async () => {
  const idx = new UsageIndex([path.join(os.tmpdir(), "vibelog-no-such-dir-xyz")]);
  await idx.refresh();
  assert.deepEqual(idx.daily(), {});
});
