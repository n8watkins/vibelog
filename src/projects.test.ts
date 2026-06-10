import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRemote } from "./git.ts";
import { aggregateDaily, type Row } from "./claude-projects.ts";

test("normalizeRemote collapses url forms to a stable host/owner/repo key", () => {
  const want = "github.com/Natkins/VibeLog";
  assert.equal(normalizeRemote("git@github.com:Natkins/VibeLog.git"), want);
  assert.equal(normalizeRemote("https://github.com/Natkins/VibeLog.git"), want);
  assert.equal(normalizeRemote("https://github.com/Natkins/VibeLog/"), want);
  assert.equal(normalizeRemote("ssh://git@github.com/Natkins/VibeLog.git"), want);
});

test("normalizeRemote strips embedded credentials (never leak a token)", () => {
  const out = normalizeRemote("https://x-access-token:ghp_supersecret@github.com/Natkins/VibeLog.git");
  assert.equal(out, "github.com/Natkins/VibeLog");
  assert.ok(!out!.includes("ghp_supersecret"));
});

test("normalizeRemote lowercases only the host and handles empties", () => {
  assert.equal(normalizeRemote("HTTPS://GitHub.com/Owner/Repo"), "github.com/Owner/Repo");
  assert.equal(normalizeRemote(""), null);
  assert.equal(normalizeRemote("   "), null);
});

test("aggregateDaily groups tokens by cwd and local day, deduped by id:requestId", () => {
  // Build timestamps in LOCAL time so the local-date bucket is TZ-independent.
  const at = (h: number, day = 9) => new Date(2026, 5, day, h, 0, 0).toISOString();
  const u = (n: number) => ({ output_tokens: n });
  const rows: Row[] = [
    { cwd: "/a/vibelog", file: "s1.jsonl", usage: u(100), id: "m1", requestId: "r1", timestamp: at(10) },
    { cwd: "/a/vibelog", file: "s1.jsonl", usage: u(50), id: "m2", requestId: "r2", timestamp: at(11) },
    // duplicate of m1:r1 — must be ignored
    { cwd: "/a/vibelog", file: "s1.jsonl", usage: u(100), id: "m1", requestId: "r1", timestamp: at(12) },
    // next day
    { cwd: "/a/vibelog", file: "s2.jsonl", usage: u(70), id: "m3", requestId: "r3", timestamp: at(9, 10) },
    // different project
    { cwd: "/b/other", file: "s3.jsonl", usage: u(200), id: "m4", requestId: "r4", timestamp: at(13) },
  ];

  const out = aggregateDaily(rows);
  assert.deepEqual(out["/a/vibelog"], { "2026-06-09": 150, "2026-06-10": 70 });
  assert.deepEqual(out["/b/other"], { "2026-06-09": 200 });
});
