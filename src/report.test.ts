import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDay, formatReport, summarizeWeek, formatWeekly, type VibeEvent } from "./report.ts";

const DATE = "2026-06-06";
// Build timestamps in LOCAL time so the local-date filter is TZ-independent.
const at = (h: number, m: number, day = 6): string =>
  new Date(2026, 5, day, h, m, 0).toISOString();

const events: VibeEvent[] = [
  { ts: at(10, 0), type: "session_started", title: "stream" },
  { ts: at(10, 1), type: "prompt_submitted", title: "build the overlay" },
  { ts: at(10, 2), type: "tool_used", tool: "Edit" },
  { ts: at(10, 3), type: "tool_used", tool: "Bash" },
  { ts: at(10, 5), type: "now_building", title: "wiring the stats card" },
  { ts: at(10, 6), type: "mark", kind: "feature", text: "LOC counter works" },
  { ts: at(10, 7), type: "mark", kind: "bug", text: "fixed double-count" },
  { ts: at(10, 8), type: "mark", kind: "decision", text: "use Cloudflare Tunnel" },
  { ts: at(10, 9), type: "mark", kind: "feature", text: "redactor scrubs secrets" },
  // a long idle gap (> 15m) then more work — should not count as active time
  { ts: at(11, 30), type: "mark", kind: "polish", text: "tightened spacing" },
  // a different day — must be excluded entirely
  { ts: at(10, 0, 5), type: "mark", kind: "feature", text: "yesterday's thing" },
];

test("summarizeDay buckets marks and counts by kind", () => {
  const s = summarizeDay(events, DATE);
  assert.deepEqual(s.features, ["LOC counter works", "redactor scrubs secrets"]);
  assert.deepEqual(s.bugs, ["fixed double-count"]);
  assert.deepEqual(s.decisions, ["use Cloudflare Tunnel"]);
  assert.deepEqual(s.polish, ["tightened spacing"]);
  assert.equal(s.prompts, 1);
  assert.equal(s.tools, 2);
  assert.equal(s.sessions, 1);
  assert.deepEqual(s.building, ["wiring the stats card"]);
});

test("summarizeDay excludes other days", () => {
  const s = summarizeDay(events, DATE);
  assert.ok(!s.features.includes("yesterday's thing"));
});

test("activeMinutes ignores gaps longer than the idle threshold", () => {
  const s = summarizeDay(events, DATE);
  // 10:00 → 10:09 contiguous (9m), then a 1h21m gap dropped. So ~9m, not 90m.
  assert.equal(s.activeMinutes, 9);
});

test("now_building titles are deduped, order preserved", () => {
  const s = summarizeDay(
    [
      { ts: at(9, 0), type: "now_building", title: "A" },
      { ts: at(9, 1), type: "now_building", title: "A" },
      { ts: at(9, 2), type: "now_building", title: "B" },
    ],
    DATE,
  );
  assert.deepEqual(s.building, ["A", "B"]);
});

test("formatReport shows an empty-day message when nothing happened", () => {
  const s = summarizeDay([], DATE);
  const out = formatReport(s);
  assert.match(out, /No activity logged today/);
});

test("formatReport renders stats block and sections", () => {
  const s = summarizeDay(events, DATE);
  const out = formatReport(
    s,
    { linesAdded: 842, linesRemoved: 219, filesChanged: 13, commits: 4, features: 2, bugs: 1, claudeTokens: 1_240_000, costUsd: 4.12, subAgents: 2, prompts: 37 },
    "VibeLog",
  );
  assert.match(out, /Vibe report — 2026-06-06/);
  assert.match(out, /\+842 \/ -219 lines/);
  assert.match(out, /1\.2M tokens/);
  assert.match(out, /Shipped/);
  assert.match(out, /LOC counter works/);
  assert.match(out, /Fixed/);
});

test("summarizeWeek rolls up exactly 7 days ending on endDate", () => {
  const w = summarizeWeek(events, DATE);
  assert.equal(w.days.length, 7);
  assert.equal(w.end, DATE);
  assert.equal(w.start, "2026-05-31");
  // 06-06's two features + the 06-05 "yesterday's thing" both fall in this week.
  assert.deepEqual(w.features, ["yesterday's thing", "LOC counter works", "redactor scrubs secrets"]);
  assert.equal(w.activeDays, 2); // 06-05 and 06-06
});

test("formatWeekly renders per-day bars and an empty-week message", () => {
  assert.match(formatWeekly(summarizeWeek([], DATE)), /No activity logged this week/);
  const out = formatWeekly(summarizeWeek(events, DATE));
  assert.match(out, /Vibe week — 2026-05-31 → 2026-06-06/);
  assert.match(out, /2\/7 active days/);
  assert.match(out, /Shipped this week/);
});
