# VibeLog — Agent Handoff / Start Here

`docs/HANDOFF.md` — the cold-start brief. Read this first, then `docs/VISION.md`
(canonical roadmap — see new **§6**, the local-tool→hosted-platform direction) and
`docs/THEMING.md` (most recently shipped subsystem). For the platform **implementation plan +
hosting cost economics**, read `docs/PLATFORM_PLAN.md` (two tracks: A = "VibeLog for me on a custom
domain, 24/7" — buildable now; B = the multi-tenant product). If anything here disagrees with
`docs/VISION.md`, that file wins.

> **Current state (2026-06-11):** `master @ 3f38aed`, **5 commits ahead of `origin/master` and
> NOT pushed** (push only when the user asks). 72 tests pass, typecheck clean. The whole local
> product is DONE; this session **defined the hosted-platform direction + the V1 MVP** (no platform
> code yet). **Next decided priority: build the V1 MVP** = "Nathan's VibeLog live on his own domain,
> 24/7, for $0" (Track A1 + local-LLM). **The build-ready spec is `docs/MVP_PLAN.md`.** Read
> `docs/VISION.md §6` + `docs/PLATFORM_PLAN.md §7` + `docs/MVP_PLAN.md` + `docs/FAQ.md` before building.
> See §5 for the older optional-polish list.

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
  `public/dashboard.html`, `public/landing.html` (marketing, X2). Look is driven entirely by
  **CSS custom properties** on `:root`. Product screenshots live in `public/shots/` and are served
  by an allowlisted `GET /shots/<name>.png` handler (exact basenames in `SHOT_FILES`, no traversal).
- **State contract:** `src/state.ts` (`LiveState`) → `~/.vibelog/state.json` → served at
  `/state.json`, read by overlay + live.
- **Data sources:** `src/ccusage.ts` (tokens/cost), `src/claude-projects.ts` +
  `src/projects.ts` + `src/git.ts` (per-project tokens/commits keyed on git remote),
  `src/obs.ts` + `src/stream.ts` (live time via OBS WebSocket), `src/social.ts` +
  `src/twitch-oauth.ts` (Twitch/YouTube), `src/summarize.ts` (Gemini Flash-Lite prompt →
  feature label), `src/demodata.ts` (seeded demo year).
- **Theming:** `src/theme.ts` (theme model + allowlist + presets + resolver; also `sanitizeProfile`
  for the S2 profile fields), persisted to `~/.vibelog/settings.json` via `src/store.ts`.
- **Share cards (G1/G2):** `src/share.ts` — builds a themed 1200×630 SVG and rasterises it to PNG
  with `@resvg/resvg-js` (the only non-`commander` runtime dep; prebuilt, no build step). Served at
  public `GET /share` (HTML page, OG/Twitter meta) + `GET /share/card.png?kind=stats|join`. All card
  data comes from already-public surface only; every dynamic string is XML-escaped into the SVG.
- **Integrations (S3):** `src/oauth.ts` — a generic Authorization-Code engine for Twitch/YouTube/
  Discord/GitHub + `integrationStatus()` (derives `{connected,configured,login}` from token/secret
  presence; never stored). Tokens persist to chmod-600 `~/.vibelog/twitch-tokens.json` (Twitch) and
  `~/.vibelog/oauth-tokens.json` (the rest). App creds read from `~/.vibelog/secrets.json`.

## 3. SECURITY INVARIANTS (do not break — keys must never hit the stream)

- **Public vs local:** `isRemote(req)` in `src/agent.ts` gates tunneled/LAN callers to the
  read-only `PUBLIC_GET_ROUTES` set (`/`, `/overlay`, `/live`, `/landing`, `/share`,
  `/share/card.png`, `/state.json`, `/api/theme.json`, `/api/presets.json`, `/api/profile.json`,
  `/shots/*.png`). **Every write and
  every key-touching route MUST stay OUT of that set** so it's localhost-only. The S3 OAuth routes
  (`POST /api/oauth/<p>/start|/disconnect`, `GET /oauth/<p>/callback`) are deliberately NOT in the
  set — the callback is a GET, so it relies on `isRemote()` 403ing remote callers (verified).
- **Secrets live only in** `~/.vibelog/secrets.json` (chmod 600); tokens in chmod-600
  `~/.vibelog/twitch-tokens.json` + `~/.vibelog/oauth-tokens.json`. Never log them (err.message only),
  never put them in `LiveState`/`state.json`/`settings.json`/any overlay-bound page, never export into
  the streamed shell. Integration `connected` state is **derived** from token presence, never stored.
- **Overlay-bound text** passes `redact()` + a 140-char cap (`src/redact.ts`).
- **Public settings-derived data** is limited to theme vars + the four profile fields: `validateVars()`
  (`src/theme.ts`) allowlists theme keys and rejects `url()/@import/;{}<>`; `sanitizeProfile()` caps
  length + strips control chars and the page renders profile via textContent only (no HTML injection).

## 4. What's DONE (shipped + committed)

- Token tracking + **per-project** attribution (tokens + commits per repo).
- **OBS stream-time** capture; **Twitch/YouTube** live + follower/sub trackers; **Twitch user
  OAuth** (`vibe twitch login`, with CSRF state); channel-growth deltas.
- **Gemini Flash-Lite** prompt→feature summarizer (non-blocking, template fallback).
- Three surfaces with a GitHub-style activity calendar (AI / Streaming / VibeLog modes).
- **Theming engine (T1–T5 COMPLETE):** desynced moving-gradient borders on all three pages, 10 presets +
  Randomize + cross-page sync, a dashboard **Settings sheet** (gear icon), `~/.vibelog/settings.json`
  persistence, public `GET /api/theme.json` + localhost `POST /api/settings`. **T4/T5 (this session):**
  8 custom color pickers (accent/secondary/highlight/bg/text/muted/aurora1/aurora2) with **hex entry**,
  and a **per-page editor** — an "Editing page" selector (Overlay/Live/Dashboard) appears when "Sync all
  pages" is off so each surface gets its own theme. New localhost-only `GET /api/settings.json` returns
  the theme sub-tree (sync/shared/perPage/presetId) so the sheet loads persisted state on open (outside
  `PUBLIC_GET_ROUTES`, so `isRemote()` 403s remote callers; no profile/integration/secret data exposed).
  Commits: `822305e` (feature), `0f13d34` (docs). See `docs/THEMING.md`. 55 tests pass, typecheck clean.
- **X2 Landing page (DONE this session):** dynamic neon marketing page at `GET /landing`
  (`public/landing.html`) built around **real product screenshots** (`public/shots/{overlay,live,
  dashboard}.png`, served via an allowlisted `GET /shots/<name>.png` route). Hero shows the real
  overlay in an OBS-style frame; full-width stream showcase, scrolling integration marquee, bento
  feature grid, alternating image/text zigzag of the three surfaces, step timeline, privacy band,
  and **interactive theme swatches that live-recolor the page**; scroll-reveal via
  IntersectionObserver (all motion gated by `prefers-reduced-motion`). OG image set to
  `/shots/live.png`. `/` still serves the OBS overlay (unchanged). Commits: `ecb5747` (initial),
  `49dd16e` (dynamic redesign), `77064e0` (docs). 55 tests pass, typecheck clean.
- **T6 neon icon pass (DONE this session):** swept overlay/live/dashboard for emoji + bare-text
  section labels and gave them on-brand neon line-art glyphs (teal `--accent2` + glow): `🎲`→shuffle
  on Randomize; bars/calendar/broadcast on the dashboard panel headers; layers/activity/bars on the
  overlay labels; layers/activity on the live headers. Pure HTML/CSS. Commit `1cbe30e`.
- **S2 Profile + S3 Integrations hub (DONE this session):** the Settings sheet now has a **profile
  editor** (display name / Twitter / channel header / bio → `sanitizeProfile()` in `src/theme.ts`,
  persisted to `settings.json`, served publicly via `GET /api/profile.json`, rendered on `/live` as
  the brand + a profile bar) and a full **integrations hub** for Twitch/YouTube/Discord/GitHub. New
  `src/oauth.ts` is a generic Authorization-Code engine (mirrors `twitch-oauth.ts`): localhost routes
  `POST /api/oauth/<p>/start`, `GET /oauth/<p>/callback` (CSRF state), `POST /api/oauth/<p>/disconnect`.
  App client id/secret live in `secrets.json`; tokens only in chmod-600 files (`twitch-tokens.json`
  reused for Twitch, `oauth-tokens.json` for the rest); the dashboard sees a **derived**
  `{ connected, configured, login }` from `integrationStatus()` — never stored, never a token.
  `GET /api/settings.json` now returns `theme` + `profile` + `integrations`. **Per-provider setup:**
  register an OAuth app with redirect URI `http://localhost:4545/oauth/<provider>/callback` and add
  `clientId`/`clientSecret` under `secrets.json.<provider>` to light up its Connect button. Commits:
  `247f20c` (profile + oauth engine), `8ddd522` (sheet + /live). 61 tests pass, typecheck clean.
- **G1/G2 Share page + OG/Twitter cards (DONE this session):** public `GET /share`
  (`public/share.html`) — themed page reusing the `/live` neon look, with **server-templated OG +
  `twitter:summary_large_image` meta**. Absolute `og:url`/`og:image` come from the request origin
  (`originOf`, which trusts the tunnel's `x-forwarded-host`/`-proto` but rejects a Host containing a
  slash/space), so links unfurl over `vibe share`. **`GET /share/card.png?kind=stats|join`** renders a
  1200×630 PNG with `@resvg/resvg-js` from a themed SVG (`src/share.ts`): "stats" = today's features/
  time-live/tokens/commits + now-building; "join" = an invite card. Card data is built (`buildShareData`)
  from ONLY public surface (4 sanitised profile fields + numeric `LiveState` stats + resolved theme
  vars); every dynamic string is XML-escaped into the SVG; no remote refs embedded. Both routes are in
  `PUBLIC_GET_ROUTES` (verified: remote 200 for both, 403 for `/api/settings.json` + `POST /api/settings`).
  New dep `@resvg/resvg-js` (prebuilt, no build step). Commit `56f8afa`. 72 tests pass, typecheck clean.

## 5. What's NEXT

> **🎯 DECIDED PRIORITY (2026-06-11): build the V1 MVP.** This session set the whole hosted-platform
> direction and produced a build-ready plan. The next agent is the **orchestrator** — read
> `docs/MVP_PLAN.md` in full (esp. §7 scope, §8 orchestration) plus `docs/VISION.md §6` and
> `docs/PLATFORM_PLAN.md §7`. **No platform code exists yet.**
>
> **V1 MVP** = *"Nathan's VibeLog, live on a public URL, 24/7, for $0"* = local-LLM summarizer +
> publisher + thin Cloudflare Worker+KV + (last) custom domain. Build order, tests, security
> checklist, and the parallel-subagent + model-tier plan are all in `docs/MVP_PLAN.md`.
>
> **Decided defaults (do NOT re-ask):** summarizer `provider:"auto"` (local→Gemini→template) per
> Nathan's "be flexible"; storage = Cloudflare **KV**; MVP cadence ~300s live / ~900s idle,
> write-on-change; **no domain needed to build/test** (free `*.workers.dev` first); **don't buy
> `vibelog.app`** (Phase 2+). Orchestrate with **Opus** (contract/integration/security review) +
> **Sonnet** (the A/B/C feature builds). **First buildable step: PR1 — the local-LLM summarizer**
> (`src/summarize.ts`), which needs nothing external.
>
> **Open for Nathan (non-blocking, only gate the *last* step):** the subdomain label
> (`vibelog.`/`live.`/`building.`) and whether he already owns `natebuilds.dev`; a free Cloudflare
> account is needed before PR3 deploys.
>
> The legacy NOW/NEXT product bucket (below) is all ✅ DONE; the remaining optional polish and the
> [LATER] bucket are now subsumed by the platform plan (see `docs/VISION.md §6`, `LATER_TRIAGE.md`).

**Optional polish (no decision needed — entry points):**
- ~~**Bundle a font for share cards**~~ — ✅ DONE (`3f8155b`). `public/fonts/{DejaVuSans,
  DejaVuSans-Bold}.ttf` are committed; `renderCardPng` now loads ONLY them
  (`loadSystemFonts: false`, `fontFiles` resolved via `import.meta.url`), so `/share/card.png`
  rasterises to a byte-stable PNG on any machine. License: `public/fonts/LICENSE.txt`.
- ~~**"Share" entry point**~~ — ✅ DONE (`56eeac6`). A ghost "Share" pill in the `/live` header
  and a share icon-button in the dashboard topbar both link to `/share`. Pure HTML/CSS, no new routes.
- **OAuth token-refresh for non-Twitch providers** — `src/oauth.ts` stores `refreshToken`/`expiresAt`
  but only `twitch-oauth.ts` auto-refreshes; add a refresh path in `oauth.ts` when a feature consumes
  YouTube/Discord/GitHub tokens.
- **Landing polish** — GitHub CTA is ✅ DONE (`a19cf01`): the "Clone on GitHub" CTA + a new footer
  link now point at the real repo (`https://github.com/n8watkins/vibelog`). Still open: compress
  `public/shots/*.png` (~1.3 MB total) — deferred, this box has no pngquant/optipng/oxipng/convert
  and a binary dep/network fetch isn't justified for the size; do it on a box that has a PNG optimiser.
- ~~**Third share card**~~ — ✅ DONE (`d375486`). `SHARE_KINDS` gained `profile` (a "My VibeLog"
  identity card: handle + header + bio over a compact stat strip), plus a `/share` tab + tests.

**[LATER] — ask the user first (needs design + an external decision):** X1 deploy guide, X3 VibeLog
MCP, X4 hosted accounts / Google login, Discord D1–D3, G3 Twitter auto-post, G4 embed widget. See
`docs/VISION.md §3.4–3.5` + §7 below.

---

**Completed-work audit trail (all ✅ DONE — kept for context):**

1. **T4/T5 theming polish** — ✅ DONE (see §4). Custom-var coverage broadened to 8 vars + hex entry,
   and the per-page (sync-off) edit UI shipped in the dashboard Settings sheet.
2. **T6 icon pass** — ✅ DONE (see §4). All overlay/live/dashboard emoji + bare-text section labels
   now use on-brand neon line-art glyphs.
3. **S2/S3 Profile + Integrations hub** — ✅ DONE (see §4). Profile editor + full OAuth integrations
   hub (Twitch/YouTube/Discord/GitHub) shipped; `src/oauth.ts` is the engine and `GET /api/profile.json`
   serves the public profile. The only remaining work is **per-provider OAuth-app registration** (a
   user step, not code): add each app's `clientId`/`clientSecret` to `~/.vibelog/secrets.json` and
   register redirect URI `http://localhost:4545/oauth/<provider>/callback`. Until then a provider's
   Connect button is disabled with a hint. Possible follow-up: **token refresh** for the new providers
   (the engine stores `refreshToken`/`expiresAt` but only Twitch auto-refreshes today, in
   `twitch-oauth.ts`); add a refresh path in `oauth.ts` when a feature actually consumes those tokens.
4. **X2 Landing page** — ✅ DONE (see §4). Dynamic page at `GET /landing` with real product
   screenshots, zigzag flow, and live-recolor theme swatches. To **refresh the screenshots** after
   any UI redesign, re-run the three captures in §6 against the demo server and overwrite
   `public/shots/*.png`. Possible follow-ups (optional): compress the PNGs (~1.3 MB total), point
   the "Clone on GitHub" CTA at the real repo URL (currently `https://github.com/`).
5. **G1/G2 Share page + OG/Twitter cards** — ✅ DONE (see §4). `/share` + `/share/card.png?kind=
   stats|join`. Font bundling is now also ✅ DONE (`3f8155b`): the repo ships DejaVu Sans under
   `public/fonts/` and `renderCardPng` loads only it (`loadSystemFonts: false`), so cards rasterise
   identically on any machine. A "Share" entry point from `/live` + dashboard is also ✅ DONE
   (`56eeac6`). Remaining optional follow-up: a third card design ("here's my VibeLog").
6. **Doc reconciliation** — ✅ DONE (this session). `README.md` rewritten (Gemini line fixed; full
   22-module file map; `demo`/`twitch login`/`/share`/`/landing` added; Safety route list +
   secrets.json model). `V0_SPEC.md`/`PRD.md`/`NEXT_STEPS.md` got HISTORICAL banners → `docs/VISION.md`.
   Added in-repo `CLAUDE.md` (streaming-safety + orientation) and a keyless **`secrets.example.json`**
   — note: NOT `.env.example`, because VibeLog reads **no env vars** (all creds in `~/.vibelog/
   secrets.json`), so an env template would be misleading. Commits `22898bc`, `b7dbfc2`.
7. **LATER (needs design + a user decision first — ask before building):** Discord server
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
- **Gotcha — restarting in one shell line:** a `kill $PID && nohup pnpm vibe demo &` compound can
  abort mid-way (the kill returns non-zero / signals the shell). Restart as **separate steps**, or
  launch the demo with the Bash tool's `run_in_background` and poll `ss -ltnp | grep :4545` until UP.
- **Refresh landing screenshots** (`public/shots/*.png`) against a running demo:
  `CH="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"`;
  `"$CH" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --virtual-time-budget=3000 --window-size=1280,720 --screenshot="C:\\Users\\natha\\Downloads\\o.png" "http://localhost:4545/overlay?preview"` (overlay — keep the transparent flag + `?preview` for the camera placeholder);
  same for `/live` (1320×900) and `/dashboard` (1440×1080); then `cp` each from Downloads into `public/shots/`.
  (No PIL/ImageMagick on this box — to view just a page region, screenshot a tall `--window-size` and `Read` the PNG.)

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
