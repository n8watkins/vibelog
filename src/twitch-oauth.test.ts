import { test } from "node:test";
import assert from "node:assert/strict";
import { needsRefresh } from "./twitch-oauth.ts";

const now = 1_700_000_000_000;

test("needsRefresh is true when already expired", () => {
  assert.equal(needsRefresh(now - 1, now), true);
  assert.equal(needsRefresh(now - 60_000, now), true);
});

test("needsRefresh is true when within 60s of expiry", () => {
  assert.equal(needsRefresh(now + 60_000, now), true); // exactly at the skew boundary
  assert.equal(needsRefresh(now + 30_000, now), true);
  assert.equal(needsRefresh(now, now), true);
});

test("needsRefresh is false when comfortably valid", () => {
  assert.equal(needsRefresh(now + 60_001, now), false);
  assert.equal(needsRefresh(now + 3_600_000, now), false);
});

test("needsRefresh defaults now to Date.now()", () => {
  assert.equal(needsRefresh(Date.now() + 3_600_000), false);
  assert.equal(needsRefresh(Date.now() - 3_600_000), true);
});
