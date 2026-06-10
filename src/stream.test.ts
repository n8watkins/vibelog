import { test } from "node:test";
import assert from "node:assert/strict";
import { streamMinutesByDay } from "./stream.ts";
import type { VibeEvent } from "./report.ts";

const at = (h: number, m: number, day = 9): string => new Date(2026, 5, day, h, m, 0).toISOString();

test("streamMinutesByDay sums paired live sessions per local day", () => {
  const events: VibeEvent[] = [
    { ts: at(10, 0), type: "live_started" },
    { ts: at(12, 30), type: "live_ended" }, // 150m on 06-09
    { ts: at(20, 0), type: "live_started" },
    { ts: at(21, 0), type: "live_ended" }, // 60m on 06-09
    { ts: at(9, 0, 10), type: "live_started" },
    { ts: at(11, 0, 10), type: "live_ended" }, // 120m on 06-10
    { ts: at(8, 0), type: "prompt_submitted" }, // ignored
  ];
  assert.deepEqual(streamMinutesByDay(events), { "2026-06-09": 210, "2026-06-10": 120 });
});

test("an open (still-live) session is counted up to now", () => {
  const events: VibeEvent[] = [{ ts: at(10, 0), type: "live_started" }];
  const now = new Date(2026, 5, 9, 11, 30, 0);
  assert.deepEqual(streamMinutesByDay(events, now), { "2026-06-09": 90 });
});

test("unpaired end and zero-length spans are ignored", () => {
  const events: VibeEvent[] = [
    { ts: at(10, 0), type: "live_ended" }, // no matching start
    { ts: at(12, 0), type: "live_started" },
    { ts: at(12, 0), type: "live_ended" }, // zero length
  ];
  assert.deepEqual(streamMinutesByDay(events), {});
});
