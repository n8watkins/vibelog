import { test } from "node:test";
import assert from "node:assert/strict";
import { isProvider, PROVIDERS } from "./oauth.ts";

test("PROVIDERS lists exactly the four supported integrations", () => {
  assert.deepEqual([...PROVIDERS].sort(), ["discord", "github", "twitch", "youtube"]);
});

test("isProvider is a strict allowlist guard", () => {
  for (const p of PROVIDERS) assert.equal(isProvider(p), true);
  assert.equal(isProvider("twitter"), false);
  assert.equal(isProvider("../../etc/passwd"), false);
  assert.equal(isProvider(""), false);
  assert.equal(isProvider("TWITCH"), false);
});
