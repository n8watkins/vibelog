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
  activity heatmap (localhost only; not exposed via `/live`).
- **`vibe report week`** — 7-day rollup recap.

Tests + typecheck pass; everything committed.

## 🔜 Next

1. **Field-test the overlay in real OBS** over a scene — the one thing only the
   user can verify (OBS is on Windows). *Deferred by user; will test later.*
2. **Polish from the field test** — sizing, contrast, motion once seen on stream.

## 🧊 Later (Tier 3 — only if outgrowing local/solo)

Deferred PRD phases: Gemini auto-summaries, Supabase + auth, public profile,
multi-day cloud history. Not needed while local/solo. *Matters later.*
