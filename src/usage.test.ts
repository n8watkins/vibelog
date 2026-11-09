import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionTokenDelta } from "./ccusage.ts";

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
