import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRange, vibeScore, formatChart, records } from "./chart.ts";
import { summarizeDay, type VibeEvent } from "./report.ts";

// LOCAL-time timestamps so the local-date bucketing is TZ-independent.
const at = (y: number, mo: number, d: number, h = 12): string =>
  new Date(y, mo - 1, d, h, 0, 0).toISOString();

test("vibeScore rewards shipping over churn", () => {
  const shipped = summarizeDay(
    [{ ts: at(2026, 6, 1), type: "mark", kind: "feature", text: "x" }],
    "2026-06-01",
  );
  const churn = summarizeDay(
    [
      { ts: at(2026, 6, 1, 12), type: "tool_used", tool: "Edit" },
      { ts: at(2026, 6, 1, 12), type: "tool_used", tool: "Bash" },
    ],
    "2026-06-01",
  );
  assert.ok(vibeScore(shipped) > vibeScore(churn));
  assert.equal(vibeScore(summarizeDay([], "2026-06-01")), 0);
});

test("summarizeRange returns one ordered cell per day ending at `end`", () => {
  const end = new Date(2026, 5, 6, 12); // 2026-06-06 local
  const events: VibeEvent[] = [
    { ts: at(2026, 6, 6), type: "mark", kind: "feature", text: "today" },
    { ts: at(2026, 6, 4), type: "mark", kind: "bug", text: "two days ago" },
  ];
  const range = summarizeRange(events, 7, end);
  assert.equal(range.length, 7);
  assert.equal(range[0]!.date, "2026-05-31");
  assert.equal(range[6]!.date, "2026-06-06");
  assert.deepEqual(range[6]!.features, ["today"]);
  assert.deepEqual(range[4]!.bugs, ["two days ago"]);
  assert.ok(range[6]!.score > 0 && range[5]!.score === 0);
});

test("formatChart renders a heatmap and a streak/score summary", () => {
  const end = new Date(2026, 5, 6, 12);
  const events: VibeEvent[] = [
    { ts: at(2026, 6, 5), type: "mark", kind: "feature", text: "a" },
    { ts: at(2026, 6, 6), type: "mark", kind: "feature", text: "b" },
  ];
  const out = formatChart(summarizeRange(events, 14, end));
  assert.match(out, /Vibe chart/);
  assert.match(out, /2-day streak/);
  assert.match(out, /2 shipped/);
  assert.match(out, /vibe score/);
  assert.match(out, /best day 2026-06/);
});

test("formatChart handles an empty range gracefully", () => {
  const out = formatChart([]);
  assert.match(out, /No activity yet/);
});

test("records finds the best single day and its date", () => {
  const end = new Date(2026, 5, 6, 12); // 2026-06-06 local
  const events: VibeEvent[] = [
    // a quiet day: one note → low score
    { ts: at(2026, 6, 2), type: "mark", kind: "note", text: "tiny" },
    // the best day: three features → high score
    { ts: at(2026, 6, 4), type: "mark", kind: "feature", text: "a" },
    { ts: at(2026, 6, 4), type: "mark", kind: "feature", text: "b" },
    { ts: at(2026, 6, 4), type: "mark", kind: "feature", text: "c" },
  ];
  const r = records(events, 14, end);
  assert.equal(r.bestDayDate, "2026-06-04");
  // best day's score must equal the max over the range
  const range = summarizeRange(events, 14, end);
  assert.equal(r.bestDayScore, Math.max(...range.map((d) => d.score)));
  assert.ok(r.bestDayScore > 0);
});

test("records computes the longest consecutive active streak", () => {
  const end = new Date(2026, 5, 10, 12); // 2026-06-10 local
  const events: VibeEvent[] = [
    // a 3-day run (Jun 1-3), then a gap, then a 2-day run (Jun 6-7)
    { ts: at(2026, 6, 1), type: "mark", kind: "feature", text: "x" },
    { ts: at(2026, 6, 2), type: "mark", kind: "feature", text: "y" },
    { ts: at(2026, 6, 3), type: "mark", kind: "feature", text: "z" },
    { ts: at(2026, 6, 6), type: "mark", kind: "feature", text: "p" },
    { ts: at(2026, 6, 7), type: "mark", kind: "feature", text: "q" },
  ];
  const r = records(events, 14, end);
  assert.equal(r.longestStreak, 3);
});

test("records is safe on empty input", () => {
  const r = records([]);
  assert.equal(r.bestDayScore, 0);
  assert.equal(r.bestDayDate, null);
  assert.equal(r.longestStreak, 0);
});
