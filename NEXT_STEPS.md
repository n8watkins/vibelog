# VibeLog — status & next steps

A running outline of what's built and what's planned. V0 is **overlay-first,
100% local, $0** (see [`V0_SPEC.md`](./V0_SPEC.md); full vision in [`PRD.md`](./PRD.md)).

## ✅ Done (V0 + extras)

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

The project is **functionally complete and safe to run** — V0 works end to end,
29 tests pass, the tunnel is hardened. What's left is verification + polish, in
priority order:

1. **End-to-end dry run (no OBS needed).** `vibe start` on a throwaway repo,
   install the Claude hooks, make real edits, and watch `/state.json` → `/live`
   → `/dashboard` update live. Unit tests cover the pure logic; nothing yet
   exercises the *integration* (hooks → agent → state → page). This is the
   highest-value next step and you can do it solo.
2. **`/live` polish.** It already renders well (verified headless: on-brand dark
   glass, live pill, stats, build log). Minor only: the build-log emoji icons
   look faint, and there's a lot of empty vertical space when the log is short.
   Not urgent — it looks good as-is.
3. **Field-test the overlay in real OBS** over a scene — the one thing only you
   can verify (OBS is on Windows). *Deferred; do when ready to actually stream.*
4. **Stream reliability** (before going live for real): confirm the overlay holds
   last-good values if git/ccusage hiccup, and decide whether an agent crash
   mid-stream should be survivable (it currently dies → blank overlay).

## 🔒 Hardening (from code review, 2026-06-06)

1. ~~**`vibe share` exposes the whole server, not just `/live`.**~~ ✅ **Fixed** —
   remote/tunneled requests now get read-only public routes only; writes and
   `/dashboard` return 403 (`isRemote()` in `agent.ts`, tested in `agent.test.ts`).
2. **Dashboard re-reads the full event log every 4s.** `/api/dashboard.json`
   calls `readEvents()` + recomputes `summarizeDay` ~92×/poll. Fine for a small
   log; on a long stream it's wasteful. **Fix:** cache parsed events in the agent
   and invalidate on `appendEvent`, or debounce the recompute.
3. **`vibe report week` ignores an explicit date** — always "this week". Minor;
   add `report week YYYY-MM-DD` if back-dated rollups are ever wanted.

## 🧊 Later (Tier 3 — only if outgrowing local/solo)

Deferred PRD phases: Gemini auto-summaries, Supabase + auth, public profile,
multi-day cloud history. Not needed while local/solo. *Matters later.*
