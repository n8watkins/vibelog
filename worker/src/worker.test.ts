/**
 * Unit tests for the VibeLog Cloudflare Worker pure-logic helpers.
 *
 * These tests run entirely in Node.js (no Cloudflare runtime needed) because
 * they only exercise exported pure functions: timingSafeEqualStr, routeKind,
 * and the snapshot field extractors.
 *
 * Run:
 *   node --test --import tsx worker/src/worker.test.ts
 *
 * from the repo root (tsx must be installed: it's a devDep of the root package,
 * so `npx tsx` works without installing inside worker/).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SNAPSHOT_KEY } from "./keys.ts";
import {
  timingSafeEqualStr,
  routeKind,
  extractState,
  extractProfile,
  extractTheme,
} from "./worker.ts";

// ---------------------------------------------------------------------------
// timingSafeEqualStr
// ---------------------------------------------------------------------------

describe("timingSafeEqualStr", () => {
  it("returns true for identical strings", () => {
    assert.equal(timingSafeEqualStr("abc123", "abc123"), true);
  });

  it("returns true for empty strings", () => {
    assert.equal(timingSafeEqualStr("", ""), true);
  });

  it("returns false for different strings of same length", () => {
    assert.equal(timingSafeEqualStr("abc123", "abc124"), false);
  });

  it("returns false when a is shorter", () => {
    assert.equal(timingSafeEqualStr("abc", "abcd"), false);
  });

  it("returns false when b is shorter", () => {
    assert.equal(timingSafeEqualStr("abcd", "abc"), false);
  });

  it("returns false for empty vs non-empty", () => {
    assert.equal(timingSafeEqualStr("", "x"), false);
    assert.equal(timingSafeEqualStr("x", ""), false);
  });

  it("returns false when strings share a long prefix but differ at the end", () => {
    const base = "a".repeat(100);
    assert.equal(timingSafeEqualStr(base + "x", base + "y"), false);
  });

  it("is case-sensitive", () => {
    assert.equal(timingSafeEqualStr("Token", "token"), false);
  });

  it("handles unicode without throwing", () => {
    assert.equal(timingSafeEqualStr("café", "café"), true);
    assert.equal(timingSafeEqualStr("café", "cafe"), false);
  });
});

// ---------------------------------------------------------------------------
// routeKind
// ---------------------------------------------------------------------------

describe("routeKind", () => {
  it("maps POST /publish", () => {
    assert.equal(routeKind("POST", "/publish"), "publish");
  });

  it("maps GET /state.json", () => {
    assert.equal(routeKind("GET", "/state.json"), "state");
  });

  it("maps GET /api/profile.json", () => {
    assert.equal(routeKind("GET", "/api/profile.json"), "profile");
  });

  it("maps GET /api/theme.json", () => {
    assert.equal(routeKind("GET", "/api/theme.json"), "theme");
  });

  it("maps GET / and /landing to home (redirects to vibelogs.dev)", () => {
    assert.equal(routeKind("GET", "/"), "home");
    assert.equal(routeKind("GET", "/landing"), "home");
  });

  it("treats HEAD like GET", () => {
    assert.equal(routeKind("HEAD", "/state.json"), "state");
    assert.equal(routeKind("HEAD", "/live"), "page");
  });

  it("maps GET /live to page (the public profile)", () => {
    assert.equal(routeKind("GET", "/live"), "page");
  });

  it("ignores trailing slash on /live/", () => {
    assert.equal(routeKind("GET", "/live/"), "page");
  });

  it("maps GET /embed to embed (the G4 widget page)", () => {
    assert.equal(routeKind("GET", "/embed"), "embed");
    assert.equal(routeKind("GET", "/embed/"), "embed");
  });

  it("does NOT route /embed.js through the worker (assets serve it directly)", () => {
    assert.equal(routeKind("GET", "/embed.js"), "not_found");
  });

  it("returns not_found for unknown GET", () => {
    assert.equal(routeKind("GET", "/unknown"), "not_found");
  });

  it("returns not_found for GET /publish (wrong method)", () => {
    assert.equal(routeKind("GET", "/publish"), "not_found");
  });

  it("returns not_found for POST /state.json (wrong method)", () => {
    assert.equal(routeKind("POST", "/state.json"), "not_found");
  });

  it("is case-insensitive for method", () => {
    assert.equal(routeKind("get", "/state.json"), "state");
    assert.equal(routeKind("post", "/publish"), "publish");
  });
});

// ---------------------------------------------------------------------------
// Snapshot field extractors
// ---------------------------------------------------------------------------

describe("extractState", () => {
  it("serialises snapshot.state", () => {
    const snap = { state: { isLive: true, stats: { tokens: 42 } }, profile: {}, theme: {} };
    const out = JSON.parse(extractState(snap));
    assert.deepEqual(out, { isLive: true, stats: { tokens: 42 } });
  });

  it("falls back to {} when state is missing", () => {
    // Simulate a partial object (shouldn't happen in practice, but test the fallback)
    const snap = { state: undefined as unknown as Record<string, unknown>, profile: {}, theme: {} };
    const out = JSON.parse(extractState(snap));
    assert.deepEqual(out, {});
  });
});

describe("extractProfile", () => {
  it("wraps profile in { profile: ... }", () => {
    const snap = {
      state: {},
      profile: { displayName: "Nate", bio: "Streamer" },
      theme: {},
    };
    const out = JSON.parse(extractProfile(snap));
    assert.deepEqual(out, { profile: { displayName: "Nate", bio: "Streamer" } });
  });
});

describe("extractTheme", () => {
  it("wraps theme in { vars: ... }", () => {
    const snap = {
      state: {},
      profile: {},
      theme: { "--accent": "#a06bff", "--bg": "#07060e" },
    };
    const out = JSON.parse(extractTheme(snap));
    assert.deepEqual(out, { vars: { "--accent": "#a06bff", "--bg": "#07060e" } });
  });
});

// ---------------------------------------------------------------------------
// SNAPSHOT_KEY constant
// ---------------------------------------------------------------------------

describe("SNAPSHOT_KEY", () => {
  it("is the expected KV key", () => {
    assert.equal(SNAPSHOT_KEY, "snapshot:nate");
  });
});

// ---------------------------------------------------------------------------
// Entry module exports
// ---------------------------------------------------------------------------

describe("worker.ts exports", () => {
  it("exports only functions and the default handler (workerd refuses to start otherwise)", async () => {
    const mod = (await import("./worker.ts")) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (name === "default") continue;
      assert.equal(typeof value, "function", `export ${name} must be a function; move constants to keys.ts`);
    }
  });
});
