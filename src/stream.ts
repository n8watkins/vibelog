import { localDateString } from "./usage.ts";
import type { VibeEvent } from "./report.ts";

/**
 * Live-stream minutes per local day, derived from `live_started` / `live_ended`
 * events in the log (emitted by the OBS websocket bridge). Each start pairs with
 * the next end; a still-open session is counted up to `now`. Duration is
 * attributed to the start day (midnight-spanning streams are rare and not split).
 * Pure + testable.
 */
export function streamMinutesByDay(events: VibeEvent[], now = new Date()): Record<string, number> {
  const marks = events
    .filter((e) => e.type === "live_started" || e.type === "live_ended")
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const out: Record<string, number> = {};
  let openTs: string | null = null;
  for (const e of marks) {
    if (e.type === "live_started") {
      openTs = e.ts;
    } else if (openTs) {
      addSpan(out, openTs, e.ts);
      openTs = null;
    }
  }
  if (openTs) addSpan(out, openTs, now.toISOString());
  return out;
}

function addSpan(out: Record<string, number>, startIso: string, endIso: string): void {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!(end > start)) return;
  const date = localDateString(new Date(start));
  out[date] = (out[date] ?? 0) + Math.round((end - start) / 60_000);
}
