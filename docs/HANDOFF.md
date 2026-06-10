# VibeLog — Agent Handoff / Start Here

`docs/HANDOFF.md` — the cold-start brief. Read this first, then `docs/VISION.md`
(canonical roadmap) and `docs/THEMING.md` (the most recently shipped subsystem).
If anything here disagrees with `docs/VISION.md`, that file wins.

---

## 1. What this is

VibeLog is a **local-first OBS-overlay coding/streaming telemetry tool**: you run a
single Node/tsx process, point it at your repos + accounts, and it serves a live
**overlay** (for OBS), a private **dashboard**, and a public **/live** page showing what
you're building, how much you stream, and how your channel is growing. Goal: anyone can
download it, set it up in minutes, and stream their public development. See `docs/VISION.md`.

## 2. Architecture (what you must know before editing)

- **One process:** `src/agent.ts` — an HTTP server on `:4545` (binds `0.0.0.0`). Polls
  git + `ccusage` + social APIs + OBS, owns the in-memory `LiveState`, serves the pages
  and JSON. Runtime is **tsx** (no build step). Package manager **pnpm**.
- **CLI:** `src/cli.ts` (commander) — `vibe start`, `vibe demo`, `vibe share`,
  `vibe twitch login`, etc.
- **Pages (static, no framework):** `public/overlay.html`, `public/live.html`,
  `public/dashboard.html`. Look is driven entirely by **CSS custom properties** on `:root`.
- **State contract:** `src/state.ts` (`LiveState`) → `~/.vibelog/state.json` → served at
  `/state.json`, read by overlay + live.
- **Data sources:** `src/ccusage.ts` (tokens/cost), `src/claude-projects.ts` +
  `src/projects.ts` + `src/git.ts` (per-project tokens/commits keyed on git remote),
  `src/obs.ts` + `src/stream.ts` (live time via OBS WebSocket), `src/social.ts` +
  `src/twitch-oauth.ts` (Twitch/YouTube), `src/summarize.ts` (Gemini Flash-Lite prompt →
  feature label), `src/demodata.ts` (seeded demo year).
- **Theming:** `src/theme.ts` (theme model + allowlist + presets + resolver), persisted to
  `~/.vibelog/settings.json` via `src/store.ts`.

## 3. SECURITY INVARIANTS (do not break — keys must never hit the stream)

- **Public vs local:** `isRemote(req)` in `src/agent.ts` gates tunneled/LAN callers to the
  read-only `PUBLIC_GET_ROUTES` set (`/`, `/overlay`, `/live`, `/state.json`,
  `/api/theme.json`, `/api/presets.json`). **Every write and every key-touching route MUST
  stay OUT of that set** so it's localhost-only (POSTs are already denied to remote).
- **Secrets live only in** `~/.vibelog/secrets.json` (chmod 600) and tokens in
  `~/.vibelog/twitch-tokens.json` (chmod 600). Never log them (err.message only), never put
  them in `LiveState`/`state.json`/`settings.json`/any overlay-bound page, never export into
  the streamed shell.
- **Overlay-bound text** passes `redact()` + a 140-char cap (`src/redact.ts`).
- **Theme values** are the only settings-derived data served publicly — `validateVars()` in
  `src/theme.ts` allowlists keys and rejects `url()/@import/;{}<>` so a palette can't inject CSS.

## 4. What's DONE (shipped + committed)

- Token tracking + **per-project** attribution (tokens + commits per repo).
- **OBS stream-time** capture; **Twitch/YouTube** live + follower/sub trackers; **Twitch user
  OAuth** (`vibe twitch login`, with CSRF state); channel-growth deltas.
- **Gemini Flash-Lite** prompt→feature summarizer (non-blocking, template fallback).
- Three surfaces with a GitHub-style activity calendar (AI / Streaming / VibeLog modes).
- **Theming engine (T1–T3):** desynced moving-gradient borders on all three pages, 10 presets +
  Randomize + custom colors + cross-page sync, a dashboard **Settings sheet** (gear icon),
  `~/.vibelog/settings.json` persistence, public `GET /api/theme.json` + localhost
  `POST /api/settings`. See `docs/THEMING.md`. 55 tests pass, typecheck clean.

## 5. What's NEXT (pick from `docs/VISION.md §5` build order)

In rough priority, with entry points:

1. **T4/T5 theming polish** — broaden custom-var coverage + a per-page (sync-off) edit UI in the
   dashboard Settings sheet. Backend + resolver already support per-page; only the UI is missing.
   Files: `public/dashboard.html` (Settings module near the bottom `<script>`), `src/theme.ts`.
2. **X2 Landing page** — a marketing page selling VibeLog (neon design, big copy, icons). Static,
   **no backend** → fully parallelizable, good first subagent task. New file under `public/`.
3. **S2/S3 Profile + Integrations hub** — profile fields (bio/Twitter/channel header) + connect
   Twitch/YouTube/Discord/GitHub from the dashboard. Data model is **already stubbed** in the
   `Settings` type (`src/theme.ts` → `profile`, `integrations`). Add a localhost
   `GET /api/settings.json`, dashboard UI, and reuse `src/twitch-oauth.ts` as the OAuth pattern.
   Tokens stay in `secrets.json`; only `connected` booleans surface.
4. **G1/G2 Share page + OG/Twitter cards** — shareable page with OG meta + server-rendered preset
   share images (daily stats / "join VibeLog").
5. **Doc reconciliation** — `README.md` is stale (says "no Gemini" but `src/summarize.ts` uses it;
   file map omits ~9 modules). `V0_SPEC.md`/`PRD.md`/`NEXT_STEPS.md` describe older directions;
   mark historical. Add an in-repo `CLAUDE.md` (streaming-safety block is in `INFRA_PLAN.md §4`)
   and a keyless `.env.example`.
6. **LATER (needs design + a user decision first — ask before building):** Discord server
   create/manage + suggestion-box front-end, Twitter auto-post, embeddable widget, VibeLog MCP,
   hosted accounts / Google login. See `docs/VISION.md §3.4–3.5`.

## 6. How to run, test, verify

- **Run demo:** `pnpm vibe demo` (serves seeded data on `:4545`). Real session: `vibe start`.
- **Typecheck:** `pnpm exec tsc --noEmit`. **Tests:** `node --test --import tsx "src/*.test.ts"`
  (currently 55 passing). Add tests for pure logic (see `src/theme.test.ts` as the pattern).
- **Visual verify (this is a WSL box):** screenshot with Windows Chrome headless →
  `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu
  --virtual-time-budget=2500 --window-size=1320,900 --screenshot="C:\\Users\\natha\\Downloads\\x.png" URL`
  then `cp /mnt/c/Users/natha/Downloads/x.png /tmp/ && Read /tmp/x.png`. Use
  `--virtual-time-budget` so async fetches settle. `/dashboard#settings` deep-links the sheet open.
- **Restart the agent** after editing any `src/*.ts` (HTML is served fresh from disk, no restart
  needed). Kill the holder of `:4545` via `ss -ltnp | grep :4545` if `pkill` misses it.

## 7. Conventions (enforced)

- **Commit after each logical, verified change** with a clear message and trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Push only when the user asks.**
- **Use subagents where appropriate**; **ask the user before major/irreversible decisions.**
- Match surrounding code style (vanilla TS, no new deps unless justified; pages are no-build
  static HTML + CSS vars).
- WSL user `natkins`, Windows user `natha`. Screenshots dir:
  `/mnt/c/Users/natha/Pictures/Screenshots`. Downloads: `/mnt/c/Users/natha/Downloads`.

## 8. Orchestration notes (for a coordinator agent)

- **Parallelizable, independent** (safe to fan out to separate subagents): X2 landing page and
  the §5.5 doc reconciliation — neither touches shared server code.
- **Design-first** (one Plan agent to design, then build): S2/S3 integrations hub (auth + settings
  surface + UI is cross-cutting) and any §6 LATER item.
- **Single-file UI tweaks** (T4/T5): do inline, no subagent needed.
- Always re-run typecheck + tests + a screenshot before committing a phase.
