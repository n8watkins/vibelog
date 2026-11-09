/**
 * Tests for src/publish.ts
 * Pattern: node:test + assert/strict (same as share.test.ts / summarize.test.ts)
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  shouldPublish,
  hashSnapshot,
  createPublisher,
  noopPublisher,
  type Snapshot,
  type ShouldPublishArgs,
} from "./publish.ts";
import { emptyState } from "./state.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// emptyState() stamps the current time; pin it so two snapshots built a
// millisecond apart still hash the same (this test used to flake).
const FIXED_STATE = { ...emptyState(), updatedAt: "2026-01-01T00:00:00.000Z" };

function makeSnap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    state: structuredClone(FIXED_STATE),
    profile: { displayName: "Nathan" },
    theme: { "--bg": "#07060e" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

test("snapshot has exactly the three frozen contract fields", () => {
  const snap = makeSnap();
  const keys = Object.keys(snap);
  assert.deepEqual(keys.sort(), ["profile", "state", "theme"]);
});

test("snapshot.state is a LiveState object with isLive", () => {
  const snap = makeSnap();
  assert.ok("isLive" in snap.state);
  assert.ok("updatedAt" in snap.state);
});

test("snapshot.profile has only sanitized profile keys", () => {
  const snap = makeSnap({ profile: { displayName: "Test", bio: "hello" } });
  const keys = Object.keys(snap.profile);
  // profile keys are a subset of: displayName, bio, twitter, channelHeader
  for (const k of keys) {
    assert.ok(["displayName", "bio", "twitter", "channelHeader"].includes(k), `unexpected key: ${k}`);
  }
});

// ---------------------------------------------------------------------------
// hashSnapshot — dedup key
// ---------------------------------------------------------------------------

test("hashSnapshot returns a 64-char hex string", () => {
  const h = hashSnapshot(makeSnap());
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("hashSnapshot is stable for identical content", () => {
  const a = hashSnapshot(makeSnap());
  const b = hashSnapshot(makeSnap());
  assert.equal(a, b);
});

test("hashSnapshot differs when content changes", () => {
  const a = hashSnapshot(makeSnap());
  const b = hashSnapshot(makeSnap({ profile: { displayName: "Different" } }));
  assert.notEqual(a, b);
});

// ---------------------------------------------------------------------------
// shouldPublish — throttle + dedup (pure)
// ---------------------------------------------------------------------------

const BASE_ARGS: ShouldPublishArgs = {
  hash: "newhash",
  lastHash: null,
  lastAt: null,
  now: 1_000_000,
  live: false,
  liveCadenceSec: 300,
  idleCadenceSec: 900,
};

test("shouldPublish returns true on first publish (no lastAt, no lastHash)", () => {
  assert.ok(shouldPublish(BASE_ARGS));
});

test("shouldPublish returns false when hash unchanged (dedup)", () => {
  assert.ok(!shouldPublish({ ...BASE_ARGS, hash: "same", lastHash: "same" }));
});

test("shouldPublish returns false when live and too soon", () => {
  const args: ShouldPublishArgs = {
    ...BASE_ARGS,
    hash: "different",
    lastHash: "old",
    lastAt: 1_000_000 - 100_000, // 100s ago — below 300s live cadence
    live: true,
    liveCadenceSec: 300,
  };
  assert.ok(!shouldPublish(args));
});

test("shouldPublish returns true when live and cadence elapsed", () => {
  const args: ShouldPublishArgs = {
    ...BASE_ARGS,
    hash: "different",
    lastHash: "old",
    lastAt: 1_000_000 - 301_000, // 301s ago — above 300s live cadence
    live: true,
    liveCadenceSec: 300,
  };
  assert.ok(shouldPublish(args));
});

test("shouldPublish returns false when idle and too soon (900s cadence)", () => {
  const args: ShouldPublishArgs = {
    ...BASE_ARGS,
    hash: "different",
    lastHash: "old",
    lastAt: 1_000_000 - 500_000, // 500s ago — below 900s idle cadence
    live: false,
    idleCadenceSec: 900,
  };
  assert.ok(!shouldPublish(args));
});

test("shouldPublish returns true when idle and cadence elapsed (900s)", () => {
  const args: ShouldPublishArgs = {
    ...BASE_ARGS,
    hash: "different",
    lastHash: "old",
    lastAt: 1_000_000 - 901_000, // 901s ago — above 900s idle cadence
    live: false,
    idleCadenceSec: 900,
  };
  assert.ok(shouldPublish(args));
});

test("live and idle cadences use different thresholds", () => {
  // At 301s elapsed: true if live (300s cadence), false if idle (900s cadence)
  const elapsed301: ShouldPublishArgs = {
    ...BASE_ARGS,
    hash: "new",
    lastHash: "old",
    lastAt: 1_000_000 - 301_000,
  };
  assert.ok(shouldPublish({ ...elapsed301, live: true, liveCadenceSec: 300 }));
  assert.ok(!shouldPublish({ ...elapsed301, live: false, idleCadenceSec: 900 }));
});

test("shouldPublish skips throttle when lastAt is null (first publish after hash set)", () => {
  // lastHash differs but lastAt is null → should publish regardless
  assert.ok(shouldPublish({ ...BASE_ARGS, hash: "new", lastHash: "old", lastAt: null }));
});

// ---------------------------------------------------------------------------
// Transport — stub globalThis.fetch to verify behaviour
// ---------------------------------------------------------------------------

// Store original fetch so we can restore it. Install a harmless default stub
// for the whole file so NO test — and no fire-and-forget POST that outlives its
// test — can ever reach the real network (the URL is "http://test.invalid/…").
// Each transport test below still overrides this with its own stub.
let originalFetch: typeof globalThis.fetch;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
});
after(() => {
  globalThis.fetch = originalFetch;
});

test("publisher POSTs with Bearer header", async () => {
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;
    return new Response(null, { status: 204 });
  };

  const pub = createPublisher({ url: "http://test.invalid/publish", token: "tok123" });
  const snap = makeSnap();
  pub.publishNow(snap);

  // Wait a tick for the async post to complete
  await new Promise((r) => setImmediate(r));

  assert.ok(capturedInit, "fetch should have been called");
  const authHeader = (capturedInit?.headers as Record<string, string>)?.["authorization"];
  assert.equal(authHeader, "Bearer tok123", "Authorization header must be Bearer token");
  assert.equal(
    (capturedInit?.headers as Record<string, string>)?.["content-type"],
    "application/json",
  );
});

test("publisher does not throw on fetch rejection and leaves lastHash unchanged", async () => {
  // Make fetch always reject
  globalThis.fetch = async () => {
    throw new Error("network error");
  };

  const pub = createPublisher({ url: "http://test.invalid/publish", token: "tok456" });
  const snap1 = makeSnap({ profile: { displayName: "First" } });
  const snap2 = makeSnap({ profile: { displayName: "Second" } });

  // publishNow should not throw
  let threw = false;
  try {
    pub.publishNow(snap1);
    await new Promise((r) => setImmediate(r));
  } catch {
    threw = true;
  }
  assert.ok(!threw, "publishNow must not throw on fetch error");

  // Because the first post failed, lastHash is null — a second publish with a
  // DIFFERENT hash should attempt again (not be deduped)
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    return new Response(null, { status: 204 });
  };

  pub.publishNow(snap2);
  await new Promise((r) => setImmediate(r));
  assert.equal(callCount, 1, "second publishNow should attempt after prior failure");
});

test("publisher does not re-POST the same snapshot twice via publishNow", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    return new Response(null, { status: 204 });
  };

  const pub = createPublisher({ url: "http://test.invalid/publish", token: "tok789" });
  const snap = makeSnap();

  pub.publishNow(snap);
  await new Promise((r) => setImmediate(r));
  pub.publishNow(snap); // same content — should be deduped
  await new Promise((r) => setImmediate(r));

  assert.equal(callCount, 1, "identical snapshots should only POST once");
});

test("tick respects throttle: no POST before cadence elapses", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount++;
    return new Response(null, { status: 204 });
  };

  // Very long cadence so the second tick is throttled
  const pub = createPublisher({ url: "http://test.invalid/publish", token: "tokT", idleCadenceSec: 99999 });
  const snap1 = makeSnap({ profile: { displayName: "A" } });
  const snap2 = makeSnap({ profile: { displayName: "B" } });

  pub.tick(snap1, { live: false });
  await new Promise((r) => setImmediate(r));
  assert.equal(callCount, 1, "first tick should POST (no lastAt)");

  pub.tick(snap2, { live: false }); // different hash, but within cadence
  await new Promise((r) => setImmediate(r));
  assert.equal(callCount, 1, "second tick within cadence should be throttled");
});

test("noopPublisher never calls fetch", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 204 });
  };

  noopPublisher.tick(makeSnap(), { live: true });
  noopPublisher.publishNow(makeSnap());
  await new Promise((r) => setImmediate(r));

  assert.ok(!called, "noopPublisher must not call fetch");
});
