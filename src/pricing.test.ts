import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, normalizeModel, priceFor } from "./pricing.ts";

test("the longest matching prefix wins", () => {
  assert.equal(priceFor("claude-opus-4-1-20250805")?.input, 15);
  assert.equal(priceFor("claude-opus-4-5-20251101")?.input, 5);
  assert.equal(priceFor("claude-opus-5-5")?.input, 4);
  assert.equal(priceFor("claude-opus-5")?.input, 5);
  assert.equal(priceFor("claude-sonnet-4-5-20250929")?.input, 3);
  assert.equal(priceFor("claude-haiku-4-5-20251001")?.output, 5);
});

test("provider prefixes, Vertex versions and context tags are ignored", () => {
  assert.equal(normalizeModel("us.anthropic.claude-sonnet-4-5-20250929-v1:0"), "claude-sonnet-4-5-20250929");
  assert.equal(normalizeModel("claude-opus-4-5@20251101"), "claude-opus-4-5");
  assert.equal(normalizeModel("claude-opus-5-5[1m]"), "claude-opus-5-5");
});

test("unknown or synthetic models cost nothing", () => {
  assert.equal(priceFor("<synthetic>"), null);
  assert.equal(priceFor(undefined), null);
  assert.equal(costOf("gpt-x", { input_tokens: 1_000_000 }), 0);
});

test("cost uses input, output, cache writes by TTL and the model's cache read rate", () => {
  // Opus 5.5: $4 in, $20 out, cache read $0.20; writes 1.25x (5m) / 2x (1h).
  const usd = costOf("claude-opus-5-5", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 2_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    cache_read_input_tokens: 1_000_000,
  });
  assert.equal(+usd.toFixed(6), 4 + 20 + 5 + 8 + 0.2);
  // Without a TTL split, writes count as 5-minute writes; reads default to 0.1x input.
  assert.equal(+costOf("claude-sonnet-4-5", { cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }).toFixed(6), 3.75 + 0.3);
});
