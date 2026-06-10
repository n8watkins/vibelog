import { test } from "node:test";
import assert from "node:assert/strict";
import { socialGrowth } from "./social.ts";
import type { VibeEvent } from "./report.ts";

const day = (d: number): string => new Date(2026, 5, d, 12, 0, 0).toISOString();

test("socialGrowth computes latest count and 7/30-day deltas per platform", () => {
  const now = new Date(2026, 5, 30, 12, 0, 0); // 2026-06-30
  const events: VibeEvent[] = [
    { ts: day(1), type: "social_snapshot", platform: "twitch", followers: 1000 },
    { ts: day(23), type: "social_snapshot", platform: "twitch", followers: 1180 }, // 7d ago
    { ts: day(30), type: "social_snapshot", platform: "twitch", followers: 1240 },
    { ts: day(30), type: "social_snapshot", platform: "youtube", followers: 3210, views: 142000 },
  ];
  const g = socialGrowth(events, now);
  assert.equal(g.twitch!.followers, 1240);
  assert.equal(g.twitch!.deltaWeek, 60); // 1240 - 1180
  assert.equal(g.twitch!.deltaMonth, 240); // 1240 - 1000
  assert.equal(g.youtube!.followers, 3210);
  assert.equal(g.youtube!.views, 142000);
});

test("socialGrowth keeps the last snapshot per day and ignores non-snapshots", () => {
  const events: VibeEvent[] = [
    { ts: day(10), type: "social_snapshot", platform: "twitch", followers: 500 },
    { ts: new Date(2026, 5, 10, 20, 0, 0).toISOString(), type: "social_snapshot", platform: "twitch", followers: 520 },
    { ts: day(11), type: "prompt_submitted", title: "x" },
  ];
  const g = socialGrowth(events, new Date(2026, 5, 11, 12, 0, 0));
  assert.equal(g.twitch!.series.length, 1);
  assert.equal(g.twitch!.followers, 520);
});
