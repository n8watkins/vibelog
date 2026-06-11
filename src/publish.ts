/**
 * Snapshot publisher — outbound-only, non-blocking.
 *
 * Builds `{ state, profile, theme }` snapshots from the already-public surface
 * (the same three things public/live.html fetches) and POSTs them to a
 * configured endpoint. Token lives in secrets.json only — never logged.
 *
 * Security:
 * - No inbound route; PUBLIC_GET_ROUTES / isRemote() untouched.
 * - Snapshot = exactly the SNAPSHOT_CONTRACT three fields, nothing more.
 * - Token never appears in logs; only err.message is ever logged.
 * - Transport failures are silent retries (lastHash unchanged → retries next tick).
 */

import { createHash } from "node:crypto";
import type { LiveState } from "./state.ts";
import type { ThemeVars } from "./theme.ts";
import type { Profile } from "./theme.ts";

// ---------------------------------------------------------------------------
// Snapshot type — the frozen wire format (docs/SNAPSHOT_CONTRACT.md §2)
// ---------------------------------------------------------------------------

/** The published JSON. Exactly three fields, nothing more. */
export type Snapshot = {
  state: LiveState;
  profile: Profile;
  theme: ThemeVars;
};

// ---------------------------------------------------------------------------
// Pure throttle/dedup logic (fully unit-testable)
// ---------------------------------------------------------------------------

export type ShouldPublishArgs = {
  hash: string;
  lastHash: string | null;
  lastAt: number | null;
  now: number;
  live: boolean;
  liveCadenceSec: number;
  idleCadenceSec: number;
};

/**
 * Pure decision function: should we publish right now?
 *
 * Returns true when BOTH:
 *   1. The content hash differs from the last successfully-published hash (write-on-change).
 *   2. Enough time has elapsed since the last publish (throttle: liveCadenceSec when live,
 *      idleCadenceSec when idle). On the very first publish (lastAt === null) the time
 *      check is skipped so startup always publishes.
 */
export function shouldPublish({
  hash,
  lastHash,
  lastAt,
  now,
  live,
  liveCadenceSec,
  idleCadenceSec,
}: ShouldPublishArgs): boolean {
  // Dedup: skip if content is unchanged
  if (hash === lastHash) return false;

  // Throttle: skip if too soon (unless this is the very first publish)
  if (lastAt !== null) {
    const cadenceMs = (live ? liveCadenceSec : idleCadenceSec) * 1000;
    if (now - lastAt < cadenceMs) return false;
  }

  return true;
}

/**
 * Compute a stable SHA-256 content hash for a snapshot.
 * Uses deterministic JSON.stringify (field order is stable because Snapshot fields
 * are always assigned in the same order).
 */
export function hashSnapshot(snapshot: Snapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// ---------------------------------------------------------------------------
// Publisher config
// ---------------------------------------------------------------------------

export type PublisherConfig = {
  url: string;
  token: string;
  liveCadenceSec?: number;
  idleCadenceSec?: number;
};

const DEFAULT_LIVE_CADENCE_SEC = 300;
const DEFAULT_IDLE_CADENCE_SEC = 900;

// ---------------------------------------------------------------------------
// Publisher factory
// ---------------------------------------------------------------------------

export type Publisher = {
  /**
   * Decide whether to publish and, if so, fire the POST.
   * Non-blocking (returns void), never throws.
   */
  tick(snapshot: Snapshot, opts: { live: boolean }): void;

  /**
   * Fire an unconditional publish (startup / shutdown). Ignores throttle but
   * still checks dedup (hash unchanged → skip). Updates lastHash/lastAt on
   * success. Never throws. Returns a promise that resolves when the POST
   * settles, so a caller (e.g. shutdown) can await it under a timeout; callers
   * that don't care can simply ignore the result.
   */
  publishNow(snapshot: Snapshot): Promise<void>;
};

/**
 * Create a publisher bound to `config`. All state (lastHash, lastAt) is
 * private to the returned object so the caller doesn't need to manage it.
 *
 * If config.url or config.token is absent (caller should pre-check), this
 * returns a no-op publisher.
 */
export function createPublisher(config: PublisherConfig): Publisher {
  const liveCadenceSec = config.liveCadenceSec ?? DEFAULT_LIVE_CADENCE_SEC;
  const idleCadenceSec = config.idleCadenceSec ?? DEFAULT_IDLE_CADENCE_SEC;

  let lastHash: string | null = null;
  let lastAt: number | null = null;

  /**
   * POST the snapshot to the configured endpoint. Non-blocking, never throws.
   * Returns true on HTTP success (2xx), false on any error.
   */
  async function post(snapshot: Snapshot): Promise<boolean> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(config.url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(snapshot),
      });
      return res.ok;
    } catch (err) {
      // Log err.message ONLY — never the token or the snapshot body
      console.error(`[publish] POST failed: ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    tick(snapshot: Snapshot, opts: { live: boolean }): void {
      const hash = hashSnapshot(snapshot);
      if (
        !shouldPublish({
          hash,
          lastHash,
          lastAt,
          now: Date.now(),
          live: opts.live,
          liveCadenceSec,
          idleCadenceSec,
        })
      ) {
        return;
      }
      // Fire-and-forget; capture hash optimistically so a second rapid tick
      // doesn't double-post. If the POST fails we'll retry on the next tick.
      const capturedHash = hash;
      void (async () => {
        const ok = await post(snapshot);
        if (ok) {
          lastHash = capturedHash;
          lastAt = Date.now();
        }
        // On failure: lastHash unchanged → next tick will retry
      })();
    },

    async publishNow(snapshot: Snapshot): Promise<void> {
      const hash = hashSnapshot(snapshot);
      // Dedup still applies for publishNow (avoid redundant final POSTs)
      if (hash === lastHash) return;
      const ok = await post(snapshot);
      if (ok) {
        lastHash = hash;
        lastAt = Date.now();
      }
    },
  };
}

/** No-op publisher for when publish config is absent. */
export const noopPublisher: Publisher = {
  tick(): void {},
  publishNow(): Promise<void> {
    return Promise.resolve();
  },
};
