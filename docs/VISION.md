# VibeLog — Vision & Roadmap

`docs/VISION.md` — status: **canonical roadmap** (source of truth for direction)

> This document supersedes the conflicting direction in `V0_SPEC.md` (frozen V0 scope),
> `PRD.md` (Supabase/Next.js SaaS framing), and `NEXT_STEPS.md` (multi-user framing).
> Those are kept as historical context only. When they disagree with this file, **this file wins.**

---

## 1. What VibeLog is

**VibeLog lets anyone stream their public development to the world.** You download it, set it
up in a few minutes, hook up your projects and accounts, and get a live overlay + dashboard that
shows what you're building, how much you stream, and how your channel is growing.

Three positioning pillars:

1. **Local-first and easy.** Clone, `vibe init`, point it at your repos, drop the overlay URL into
   OBS. No account required to run the overlay locally.
2. **Optionally deployed.** If you want a public dashboard others can visit (and share), deploy it
   (e.g. Vercel). The overlay can stay purely local even then.
3. **Yours to brand.** Themes, profile, socials, share cards — make your VibeLog look like *your*
   channel, not a generic widget.

**Core invariant (never violated):** only user-typed names and numeric stats ever reach
`LiveState` / `/state.json`. No paths, diffs, raw prompts, or secrets. `isRemote()` keeps tunneled/
public callers on read-only public routes; every write stays localhost-only. See `docs/INFRA_PLAN.md`.

---

## 2. What already ships today

- **Token tracking** (Claude usage via ccusage) and **per-project attribution** keyed on git remote
  (tokens + commits per repo) — `src/projects.ts`, `src/claude-projects.ts`, `src/git.ts`.
- **Streaming time** captured from **OBS WebSocket** (`live_started`/`live_ended`) — `src/obs.ts`,
  `src/stream.ts`.
- **Social trackers**: Twitch live/viewers/followers (with `vibe twitch login` OAuth) + YouTube
  subs/views, plus channel-growth deltas — `src/social.ts`, `src/twitch-oauth.ts`.
- **Prompt → feature summary** via Gemini Flash-Lite with a template fallback — `src/summarize.ts`.
- **Three surfaces**: `/overlay` (OBS), `/dashboard` (private, localhost), `/live` (public page),
  plus a GitHub-style activity calendar with AI / Streaming / VibeLog-score modes.
- **Theming engine** (shipped): desynced moving-gradient borders on overlay/dashboard/live,
  10 curated presets + Randomize + custom colors + cross-page sync, a dashboard Settings sheet,
  persisted to `~/.vibelog/settings.json` (localhost writes, public theme read). See `docs/THEMING.md`.

---

## 3. Roadmap — tiered by readiness

Legend: **[NOW]** buildable now, ready to plan/approve · **[NEXT]** needs design but mostly doable ·
**[LATER]** bigger / needs more info or external decisions · **[PARKED]** intentionally dropped.

### 3.1 Theming & look-and-feel

- **T1 [DONE] — Fix & desync the moving gradient.** Per-card different colors (hue-rotate),
  different start corners (per-card start angle), slower movement, desynced phase (negative delays +
  mutually-prime durations). Pure CSS, OBS-safe.
- **T2 [DONE] — Gradient extended to the dashboard panels** (with the T1 timing fixes).
- **T3 [DONE] — Theming engine.** A theme = a JSON object of CSS variables re-skinning the entire
  page. 10 curated presets + a Randomize button (curated, never arbitrary RGB). Persisted to
  `~/.vibelog/settings.json`; public theme-read route, localhost-only write. See `docs/THEMING.md`.
- **T4 [PARTLY DONE] — Custom color combinations.** Four custom color pickers ship in the Settings
  sheet, validated against a strict allowlist so a palette can never inject CSS into overlay pages.
  Remaining polish: more var coverage + hex entry.
- **T5 [PARTLY DONE] — Per-page themes + sync toggle.** The sync toggle ships and the data model +
  resolver already support per-page (sync-off) themes; remaining: a UI to edit each page separately.
- **T6 [NOW] — Icon pass.** Use on-brand neon icons everywhere we currently use bare text/emoji.

### 3.2 Settings & profile

- **S1 [NEXT] — Settings surface on the dashboard.** Today there is **no settings UI at all**.
  Start with the theme picker (T3), then grow it. Persist server-side in `~/.vibelog/settings.json`
  (localhost-only writes) so the overlay — which can't share localStorage with the dashboard or OBS
  — reads the same theme. See `docs/THEMING.md` for the data model + routes.
- **S2 [NEXT] — Profile fields:** display name, **bio**, **Twitter handle**, **channel header**,
  other socials. These render on `/live` and the share card. Data model already stubbed in
  `settings.json` (`profile`).
- **S3 [NEXT] — Integrations hub.** A Settings → Integrations section to connect **Twitch, YouTube,
  Discord, GitHub** from the dashboard, with connect/disconnect buttons and a "connected" indicator.
  Tokens stay in `secrets.json`; only `connected` booleans surface in settings. Reuses
  `src/twitch-oauth.ts` as the pattern.

### 3.3 Sharing & growth

- **G1 [NEXT] — Share your VibeLog.** A shareable public page (the deployed `/live` or a dedicated
  profile route) with proper **OG / Twitter card** meta so links unfurl nicely.
- **G2 [NEXT] — Preset share images / cards.** Pick from preset card designs: "here's my VibeLog",
  "invite people to join VibeLog", or "today's stats" (what I built, hours live, tokens). Generated
  on the server from live data.
- **G3 [LATER] — Auto-post to Twitter/X.** Connect Twitter and optionally auto-post a daily-stats
  card. Needs Twitter API access + posting cadence/consent design.
- **G4 [LATER] — Embeddable widget.** Let people inject their dashboard (or a compact stat strip)
  as a widget on another site. Needs an embed/iframe story + a public, read-only, themed widget
  route. Open question: where it gets embedded.

### 3.4 Discord

- **D1 [LATER] — Connect a Discord server** from the dashboard, including **create a server** with a
  button if you don't have one, and make changes to an existing server.
- **D2 [LATER] — Discord notifications** (e.g. "going live", daily recap).
- **D3 [LATER] — Suggestion box front-end.** Nathan has a **separate private project** (a
  suggestion box + Discord bot/automations for his stream). The intent is to eventually fold that
  infrastructure into VibeLog as an optional module — a front-end to browse/triage suggestions.
  **Not building now;** captured here so the architecture leaves room for it.

### 3.5 Distribution & extensibility

- **X1 [NEXT] — Deploy guide.** Step-by-step for deploying the public dashboard (Vercel or similar)
  while keeping the overlay local. Clarify what runs where (local agent vs. hosted read-only view).
- **X2 [NOW-ISH] — Landing page.** A marketing landing page that sells VibeLog: keep the neon
  design, go all out on copy, show off everything (stream what you build, integrations, sharing,
  auto-post, token tracking), heavy use of icons. Static, no backend needed.
- **X3 [LATER] — VibeLog MCP.** Ship VibeLog's own MCP server so the Claude desktop app can read
  and modify VibeLog (settings, theme, profile) directly. Next-level; needs the settings API
  (S1) to exist first.
- **X4 [LATER] — Hosted accounts / primary login.** "Log in with Google" (or another major
  provider), then connect all your accounts under one identity — for the deployed multi-user
  version. This is the largest, least-defined piece; depends on a hosting/auth decision. The PRD's
  old Supabase framing lives here, not in the local-first core.

### 3.6 Parked

- **[PARKED] — GitHub repo images.** Explicitly dropped — projects don't have meaningful images.
  Do not reintroduce.

---

## 4. Documentation health (from the docs audit)

The docs need reconciliation; this file is step one. Outstanding:

- **README** — stale file map (missing `obs.ts`, `social.ts`, `secrets.ts`, `summarize.ts`,
  `twitch-oauth.ts`, `stream.ts`, `projects.ts`, `config.ts`, `demodata.ts`) and a direct
  contradiction: it says "no Gemini" while `src/summarize.ts` uses it. Fix the file map + the
  tracking section, add `demo` / `twitch login` to the CLI list.
- **V0_SPEC.md / PRD.md / NEXT_STEPS.md** — mark as historical; they describe frozen-V0,
  Supabase-SaaS, and multi-user respectively, none of which is the current local-first direction.
- **In-repo `CLAUDE.md`** — `docs/INFRA_PLAN.md §4` already contains a copy-pasteable
  streaming-safety block; commit it as an actual `CLAUDE.md`.
- **`.env.example`** — referenced by INFRA_PLAN but missing; add placeholders (no real keys).

---

## 5. Suggested build order (smallest valuable units first)

1. **T1 + T2 + var groundwork** — gradient desync fix on all three pages + introduce the CSS-variable
   schema themes will ride on. Pure CSS, no API surface. *(smallest first PR — see `docs/THEMING.md §e`)*
2. **T3 + S1 (theme slice)** — settings.json persistence, public theme-read route, localhost-only
   write route, ~10 presets + Randomize, applied across all pages.
3. **T4 + T5** — custom colors + per-page sync toggle.
4. **X2 — landing page** (parallelizable any time; no backend dependency).
5. **S2 + S3** — profile fields + integrations hub UI.
6. **G1 + G2** — share page + OG/preset cards.
7. **[LATER] bucket** — Discord, auto-post, embed widget, MCP, hosted accounts — each needs its own
   design pass and an external decision before planning.
