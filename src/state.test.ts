import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, toPublicState } from "./state.ts";

function liveState() {
  const s = emptyState();
  s.stats.claudeTokens = 1_240_000;
  s.stats.costUsd = 4.12;
  s.stats.prompts = 37;
  return s;
}

test("toPublicState drops dollar spend by default but keeps token counts", () => {
  const pub = toPublicState(liveState(), { showCost: false });
  assert.equal("costUsd" in pub.stats, false);
  assert.equal(pub.stats.claudeTokens, 1_240_000);
  assert.equal(pub.stats.prompts, 37);
  // The figure must not leak through serialisation either.
  assert.equal(JSON.stringify(pub).includes("costUsd"), false);
  assert.equal(JSON.stringify(pub).includes("4.12"), false);
});

test("toPublicState keeps dollar spend when the owner opts in", () => {
  const pub = toPublicState(liveState(), { showCost: true });
  assert.equal(pub.stats.costUsd, 4.12);
  assert.equal(pub.stats.claudeTokens, 1_240_000);
});

test("toPublicState never mutates the private live state", () => {
  const s = liveState();
  toPublicState(s, { showCost: false });
  assert.equal(s.stats.costUsd, 4.12);
});
