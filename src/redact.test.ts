import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, containsSecret, REDACTION_PLACEHOLDER } from "./redact.ts";

const SECRETS = [
  "sk-ant-api03-abc123DEF456ghi789JKL012mno345",
  "sk-proj-ABCDEFGHIJKLMNOP1234567890",
  "ghp_1234567890abcdefghijABCDEFGHIJ123456",
  "github_pat_11ABCDEFG0abcdefghij_KLMNOPqrstuvwxyz1234567890",
  "AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q",
  "xoxb-1234567890-ABCDEFGHIJKLMNOP",
  "Bearer abcdef1234567890ABCDEF",
  "api_key=supersecretvalue123",
  "API-KEY: anotherSecret9999",
  "password=hunter2hunter2",
  "ANTHROPIC_API_KEY=sk-ant-xyz9876543210abcdef",
];

test("redacts each known secret shape", () => {
  for (const secret of SECRETS) {
    const out = redact(secret);
    assert.ok(
      out.includes(REDACTION_PLACEHOLDER),
      `expected redaction in: ${secret} -> got: ${out}`,
    );
    assert.ok(containsSecret(secret), `containsSecret should be true for: ${secret}`);
  }
});

test("redacts a secret embedded in normal milestone text", () => {
  const msg = "Wired up the client with token=ghp_abcdefghij1234567890ABCDEFG and it works";
  const out = redact(msg);
  assert.ok(out.startsWith("Wired up the client with"));
  assert.ok(out.includes(REDACTION_PLACEHOLDER));
  assert.ok(!out.includes("ghp_abcdefghij"));
});

test("redacts a private key block", () => {
  const key =
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----";
  assert.ok(!redact(key).includes("MIIEvQ"));
});

test("leaves clean text untouched", () => {
  const clean = [
    "live LOC counter works",
    "fixed double-count on git stash",
    "Choosing the overlay layout for the stats card",
    "Building the live tracker",
  ];
  for (const text of clean) {
    assert.equal(redact(text), text, `clean text changed: ${text}`);
    assert.equal(containsSecret(text), false, `false positive on: ${text}`);
  }
});
