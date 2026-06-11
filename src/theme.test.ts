import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVars, resolveTheme, sanitizeProfile, DEFAULT_THEME, PRESETS, THEME_VAR_KEYS, type Settings } from "./theme.ts";

test("validateVars keeps allowlisted color/gradient values", () => {
  const out = validateVars({
    "--accent": "#2ee6c0",
    "--bg": "#04100f",
    "--glow": "0 0 22px rgba(46, 230, 192, 0.4)",
    "--glass": "linear-gradient(165deg, rgba(12, 52, 48, 0.55), rgba(6, 18, 22, 0.64))",
  });
  assert.equal(out["--accent"], "#2ee6c0");
  assert.equal(out["--bg"], "#04100f");
  assert.equal(out["--glow"], "0 0 22px rgba(46, 230, 192, 0.4)");
  assert.ok(out["--glass"]?.startsWith("linear-gradient("));
});

test("validateVars drops keys outside the allowlist", () => {
  const out = validateVars({ "--accent": "#fff", "--evil": "red", "color": "red" } as Record<string, string>);
  assert.equal(out["--accent"], "#fff");
  assert.ok(!("--evil" in out));
  assert.ok(!("color" in out));
});

test("validateVars rejects CSS-injection payloads", () => {
  const out = validateVars({
    "--border": "url(http://evil/x)",
    "--bg": "red; background: url(x)",
    "--accent": "#fff}body{display:none",
    "--pink": "expression(alert(1))",
    "--text": "@import 'x'",
    "--muted": "javascript:alert(1)",
  });
  assert.deepEqual(out, {}, "every unsafe value must be stripped");
});

test("validateVars caps absurdly long values and tolerates non-objects", () => {
  assert.deepEqual(validateVars(null), {});
  assert.deepEqual(validateVars("nope"), {});
  const long = validateVars({ "--bg": "#" + "a".repeat(300) });
  assert.ok(!("--bg" in long));
});

test("resolveTheme returns full defaults when no settings", () => {
  const vars = resolveTheme(null, "overlay");
  for (const k of THEME_VAR_KEYS) assert.ok(vars[k], `default theme defines ${k}`);
  assert.equal(vars["--accent"], DEFAULT_THEME.vars["--accent"]);
});

test("resolveTheme merges a partial shared theme over the default (sync on)", () => {
  const settings: Settings = { version: 1, theme: { sync: true, shared: { "--accent": "#2ee6c0" } } };
  const vars = resolveTheme(settings, "overlay");
  assert.equal(vars["--accent"], "#2ee6c0", "override applied");
  assert.equal(vars["--bg"], DEFAULT_THEME.vars["--bg"], "unspecified vars fall back to default");
});

test("resolveTheme honors per-page themes when sync is off", () => {
  const settings: Settings = {
    version: 1,
    theme: {
      sync: false,
      shared: { "--accent": "#111111" },
      perPage: { dashboard: { "--accent": "#abcdef" } },
    },
  };
  assert.equal(resolveTheme(settings, "dashboard")["--accent"], "#abcdef", "dashboard uses its own");
  assert.equal(resolveTheme(settings, "overlay")["--accent"], "#111111", "overlay falls back to shared");
});

test("resolveTheme strips injection from stored shared vars on read", () => {
  const settings = { version: 1, theme: { sync: true, shared: { "--accent": "url(x)" } } } as unknown as Settings;
  assert.equal(resolveTheme(settings, "overlay")["--accent"], DEFAULT_THEME.vars["--accent"]);
});

test("there are ~10 presets, all with ids and the default first", () => {
  assert.ok(PRESETS.length >= 10);
  assert.equal(PRESETS[0]!.id, "aurora-purple");
  const ids = new Set(PRESETS.map((p) => p.id));
  assert.equal(ids.size, PRESETS.length, "preset ids are unique");
  for (const p of PRESETS) assert.ok(Object.keys(validateVars(p.vars)).length >= 10, `${p.id} is a full theme`);
});

test("sanitizeProfile keeps known fields, trims, and caps length", () => {
  const out = sanitizeProfile({
    displayName: "  Nathan Watkins  ",
    bio: "Building VibeLog in public",
    channelHeader: "Live coding and vibes",
  });
  assert.equal(out.displayName, "Nathan Watkins");
  assert.equal(out.bio, "Building VibeLog in public");
  assert.equal(out.channelHeader, "Live coding and vibes");
  const long = sanitizeProfile({ bio: "x".repeat(500) });
  assert.equal(long.bio!.length, 280, "bio is capped at 280");
});

test("sanitizeProfile normalises the Twitter handle and strips junk", () => {
  assert.equal(sanitizeProfile({ twitter: "@nathan" }).twitter, "nathan");
  assert.equal(sanitizeProfile({ twitter: "  @@nat_kins!  " }).twitter, "nat_kins");
  assert.equal(sanitizeProfile({ twitter: "https://x.com/foo" }).twitter, "httpsxcomfoo");
});

test("sanitizeProfile drops unknown keys and non-string/empty values", () => {
  const out = sanitizeProfile({ displayName: 42, evil: "<script>", bio: "   " } as Record<string, unknown>);
  assert.deepEqual(out, {});
});

test("sanitizeProfile collapses whitespace runs and tolerates non-objects", () => {
  assert.deepEqual(sanitizeProfile(null), {});
  assert.deepEqual(sanitizeProfile("nope"), {});
  assert.equal(sanitizeProfile({ bio: "a   b" }).bio, "a b");
});
