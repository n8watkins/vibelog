# VibeLog — status & next steps

> **⚠️ HISTORICAL.** This outline describes an earlier multi-user framing and is no longer
> the source of truth. For current status + roadmap see [`docs/VISION.md`](./docs/VISION.md)
> (canonical) and [`docs/HANDOFF.md`](./docs/HANDOFF.md) §4–5. Kept for historical context.

A running outline of what's built and what's planned. V0 is **overlay-first,
100% local, $0** (see [`V0_SPEC.md`](./V0_SPEC.md); full vision in [`PRD.md`](./PRD.md)).

## ✅ Done (V0 + extras)

- **Redesign — solo phase 1 (2026-06-09)** — sharpened the product around the
  metrics that matter:
  - **`/live`** is now unambiguously the public "right now" view: the build log
    became a **chat-style feed** (oldest→newest, newest at the bottom, only new
    entries animate in, auto-scrolls), and the stat tiles are **features · fixes ·
    tokens · cost ($) · commits · sub-agents** (dropped lines/files).
  - **`/dashboard`** is now the private "over-time" view. Its activity heatmap is
    recolored by **one honest axis — Claude tokens/day** (from ccusage), with a
    caption stating range + totals; Today panel drops sessions/tool-calls and
    adds cost + sub-agents.
  - New backend signals: **session cost ($)** (ccusage cost, baselined like
    tokens) and **sub-agents** (Task-tool invocations). Build-feed entries are
    timestamped `{ text, ts }`.
- **Agent + overlay** — one Node/TS process (`src/agent.ts`) tracks git + Claude
  tokens and serves the OBS overlay (`/overlay`) and shareable `/live` page over
  HTTP on `:4545` (binds `0.0.0.0` so Windows OBS reaches WSL).
- **CLI** (`src/cli.ts`, commander): `init · start · building · mark · end ·
  status · demo · hooks · tokens · report · chart`.
- **Git stats** — lines ±, files (incl. untracked), commits since session start,
  branch; polled every 5s.
- **Claude tokens** — session-scoped (today's ccusage total − baseline at start),
  local-date matched; polled every 30s.
- **Tokens by project** (`vibe tokens`) — parses local Claude transcripts.
- **Redaction** (`src/redact.ts`) — scrubs secrets from every user string before
  it can reach the overlay; raw history stays private in `~/.vibelog/events.jsonl`.
- **Claude Code hooks** — prompt → "Now Building"; tool/stop → refresh git.
- **`vibe report [today|yesterday|YYYY-MM-DD]`** — local daily recap from the
  event log + last state snapshot. No AI, no network.
- **`vibe chart`** — GitHub-style activity heatmap + Vibe Score, in the terminal.
- **Private dashboard** (`/dashboard`) — browser view of today's state + recap +
  activity heatmap (localhost only — enforced, see below).
- **`vibe report week`** — 7-day rollup recap.
- **Tunnel hardening** — remote/tunneled callers (detected via cloudflared's
  forwarding headers) get read-only public routes only (`/`, `/overlay`, `/live`,
  `/state.json`); writes (`mark`/`building`/`end`/hooks) and `/dashboard` return
  403. So `vibe share` can no longer leak the dashboard or accept viewer writes.

Tests + typecheck pass; everything committed.

## ▶️ Pick up here (next session)

### Phase 2 — multi-user VibeLog (the next big direction)

The headline next move: let **anyone** run VibeLog as a CLI addition to their
project, across **multiple terminals**, feeding one shared feed. This is an
architecture decision, not a tweak. Open questions to settle first:

- **Exposure model** — *what does each participant expose to VibeLog?* (project
  name, metrics, feed entries — but never paths/diffs/prompts). Per-participant
  opt-in; the redactor already gates user strings.
- **Topology** — one shared agent/hub that multiple CLIs report to (identity per
  terminal/person), vs. a federation of local agents aggregated into one view.
- **Multiplayer views** — `/live` showing several builders at once; "simultaneous
  builders" as a first-class number.

Build solo-first foundations (done) → design the shared data model → views on top.

### Solo polish still worth doing

1. **End-to-end dry run (no OBS needed).** `vibe start` on a throwaway repo,
   install the Claude hooks, make real edits, and watch `/state.json` → `/live`
   → `/dashboard` update live. Unit tests cover the pure logic; nothing yet
   exercises the *integration* (hooks → agent → state → page).
2. **Field-test the overlay in real OBS** over a scene — the one thing only you
   can verify (OBS is on Windows). The overlay still shows lines/files; decide
   whether to bring it in line with the new `/live` metric set.
3. **Stream reliability** — confirm the overlay holds last-good values if
   git/ccusage hiccup. (Agent no longer crashes on a malformed request path —
   fixed 2026-06-09.)

## 🔒 Hardening (from code review, 2026-06-06)

1. ~~**`vibe share` exposes the whole server, not just `/live`.**~~ ✅ **Fixed** —
   remote/tunneled requests now get read-only public routes only; writes and
   `/dashboard` return 403 (`isRemote()` in `agent.ts`, tested in `agent.test.ts`).
2. **Dashboard re-reads the full event log every 4s.** `/api/dashboard.json`
   calls `readEvents()` + recomputes `summarizeDay` ~92×/poll. Fine for a small
   log; on a long stream it's wasteful. **Fix:** cache parsed events in the agent
   and invalidate on `appendEvent`, or debounce the recompute. (The ccusage
   per-day call this route now makes *is* cached — 60s TTL — but the event
   re-read still stands.)
3. **`vibe report week` ignores an explicit date** — always "this week". Minor;
   add `report week YYYY-MM-DD` if back-dated rollups are ever wanted.

## 🧊 Later (Tier 3 — only if outgrowing local/solo)

Deferred PRD phases: Gemini auto-summaries, Supabase + auth, public profile,
multi-day cloud history. Not needed while local/solo. *Matters later.*
