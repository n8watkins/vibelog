import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTokens } from "./format.ts";

test("formatTokens uses K, M and B", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1_000), "1.0K");
  assert.equal(formatTokens(12_345), "12.3K");
  assert.equal(formatTokens(1_240_000), "1.2M");
  assert.equal(formatTokens(301_600_000), "301.6M");
  assert.equal(formatTokens(4_560_000_000), "4.6B");
});

test("formatTokens never shows 1000.0 of a smaller unit", () => {
  assert.equal(formatTokens(999_999), "1.0M");
  assert.equal(formatTokens(999_960_000), "1.0B");
});
