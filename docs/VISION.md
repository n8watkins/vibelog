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
2. **Optionally deployed.** If you want a public dashboard others can visit (and share), the local
   agent **publishes a sanitized snapshot** to a hosted service that serves it 24/7 — the overlay
   stays purely local even then. (This refines the old "deploy the whole app to Vercel" framing;
   see **§6** for the publisher architecture, delivery, business model, and trust story.)
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
- **T4 [DONE] — Custom color combinations.** Eight custom color pickers (accent/secondary/highlight/
  background/text/muted/aurora1/aurora2) with hex entry ship in the Settings sheet, validated against a
  strict allowlist so a palette can never inject CSS into overlay pages.
- **T5 [DONE] — Per-page themes + sync toggle.** Sync toggle + per-page (sync-off) editing both ship:
  an "Editing page" selector (Overlay/Live/Dashboard) appears when sync is off so each surface gets
  its own theme, loaded via the localhost `GET /api/settings.json` and saved as `perPage`.
- **T6 [NOW] — Icon pass.** Use on-brand neon icons everywhere we currently use bare text/emoji.

### 3.2 Settings & profile

- **S1 [NEXT] — Settings surface on the dashboard.** Today there is **no settings UI at all**.
  Start with the theme picker (T3), then grow it. Persist server-side in `~/.vibelog/settings.json`
  (localhost-only writes) so the overlay — which can't share localStorage with the dashboard or OBS
  — reads the same theme. See `docs/THEMING.md` for the data model + routes.
- **S2 [DONE] — Profile fields.** Display name, bio, Twitter handle and channel header edit in the
  dashboard Settings sheet, persist to `settings.json` (`profile`, sanitised via `sanitizeProfile`),
  and render on `/live` (display name as the brand + a channel-header/bio/Twitter profile bar) via a
  public `GET /api/profile.json`. textContent-only render; the four fields are the only profile data
  ever served.
- **S3 [DONE] — Integrations hub.** A Settings → Integrations section connects **Twitch, YouTube,
  Discord, GitHub** from the dashboard with Connect/Disconnect + a Connected/Off pill. Full
  Authorization-Code OAuth in `src/oauth.ts` (mirrors `src/twitch-oauth.ts`): localhost routes
  `POST /api/oauth/<p>/start`, `GET /oauth/<p>/callback` (CSRF state), `POST /api/oauth/<p>/disconnect`.
  App client id/secret live in `secrets.json`; issued tokens only in chmod-600 files; the dashboard
  sees a **derived** `{ connected, configured, login }` (computed by `integrationStatus()`, never
  stored, never a token). **Setup:** each provider needs an OAuth app registered with redirect URI
  `http://localhost:4545/oauth/<provider>/callback` and its `clientId`/`clientSecret` in
  `~/.vibelog/secrets.json` (`twitch`/`youtube`/`discord`/`github`) before Connect is enabled.

### 3.3 Sharing & growth

- **G1 [DONE] — Share your VibeLog.** Public `GET /share` (`public/share.html`) — a themed page
  reusing the neon `/live` look, with **server-templated OG + `twitter:summary_large_image` meta**.
  Absolute `og:url`/`og:image` are built from the request origin (`originOf` in `src/agent.ts`) so
  links unfurl over the `vibe share` Cloudflare Tunnel; a spoofed Host can't smuggle a scheme/path.
  Display name + description come from the public profile. Both `/share` routes are in
  `PUBLIC_GET_ROUTES`.
- **G2 [DONE] — Preset share images / cards.** `GET /share/card.png?kind=stats|join` (public) —
  a server-rendered **1200×630 PNG** via `@resvg/resvg-js` from a themed SVG (`src/share.ts`).
  "stats" = today's features / time-live / tokens / commits + now-building; "join" = an invite card.
  Painted with the user's resolved theme vars, built from ONLY already-public surface (the four
  sanitised profile fields + numeric `LiveState` stats + theme vars). Every dynamic string is
  XML-escaped before entering the SVG and the card embeds no remote refs — neither an injection nor
  an exfil vector. The `/share` page has a stats/join toggle, live preview, copy-link + Post-on-X.
- **G3 [LATER] — Auto-post to Twitter/X.** Connect Twitter and optionally auto-post a daily-stats
  card. Needs Twitter API access + posting cadence/consent design.
- **G4 [LATER] — Embeddable widget.** Let people inject their dashboard (or a compact stat strip)
  as a widget on another site (`<iframe>`/`<script>` on `natebuilds.dev/vibelog`). The free,
  badge-carrying viral surface — see **§6.4**. Needs the hosted snapshot service (§6.2) underneath.

### 3.4 Discord

- **D1 [LATER] — Connect a Discord server** from the dashboard, including **create a server** with a
  button if you don't have one, and make changes to an existing server.
- **D2 [LATER] — Discord notifications** (e.g. "going live", daily recap).
- **D3 [LATER] — Suggestion box front-end.** Nathan has a **separate private project** (a
  suggestion box + Discord bot/automations for his stream). The intent is to eventually fold that
  infrastructure into VibeLog as an optional module — a front-end to browse/triage suggestions.
  **Not building now;** captured here so the architecture leaves room for it.

### 3.5 Distribution & extensibility

- **X1 [NEXT] — Deploy guide.** Step-by-step for standing up the hosted snapshot service (Vercel +
  KV/blob) and pairing the local agent to it, while keeping the overlay local. Clarify what runs
  where (local **publisher** agent vs. hosted read-only view). Now framed by the §6 platform model.
- **X2 [DONE] — Landing page.** Static marketing page at `GET /landing` (`public/landing.html`),
  reusing the shared neon palette/aurora/travelling-gradient rings. Sticky nav, hero with a mocked
  overlay, 12-card feature grid, three-step setup, the three surfaces, a privacy band, a theming
  preset strip, final CTA + footer; heavy inline-SVG icons; OG/Twitter meta. No backend, no existing
  route changed (`/` stays the OBS overlay).
- **X3 [LATER] — VibeLog MCP.** Ship VibeLog's own MCP server so the Claude desktop app can read
  and modify VibeLog (settings, theme, profile) directly. Next-level; needs the settings API
  (S1) to exist first.
- **X4 [LATER] — Hosted accounts / primary login.** "Log in with Google" (or another major
  provider), then claim an `@handle` and pair your local agent to publish under one identity — the
  **owner auth** half of §6.5 (viewers never log in). The PRD's old Supabase framing lives here, not
  in the local-first core. Custom domains (the hero upsell, §6.6) build on top of this.

### 3.6 Parked

- **[PARKED] — GitHub repo images.** Explicitly dropped — projects don't have meaningful images.
  Do not reintroduce.

---

## 4. Documentation health (from the docs audit)

✅ **DONE — reconciled.** All audit items are resolved:

- **README** — file map rewritten to cover all 22 modules + current pages/docs; the "no Gemini"
  contradiction fixed; `demo` / `twitch login` + the `/share` & `/landing` surfaces added; Safety
  route list updated to the full `PUBLIC_GET_ROUTES` set; the secrets.json (no-env) model documented.
- **V0_SPEC.md / PRD.md / NEXT_STEPS.md** — each now carries a HISTORICAL banner pointing here.
- **In-repo `CLAUDE.md`** — committed (streaming-safety block from `INFRA_PLAN.md §4` + orientation).
- **Keyless config example** — shipped as **`secrets.example.json`** (not `.env.example`): VibeLog
  reads no env vars, so an env template would mislead; all creds live in `~/.vibelog/secrets.json`.

---

## 5. Suggested build order (smallest valuable units first)

1. **T1 + T2 + var groundwork** — gradient desync fix on all three pages + introduce the CSS-variable
   schema themes will ride on. Pure CSS, no API surface. *(smallest first PR — see `docs/THEMING.md §e`)*
2. **T3 + S1 (theme slice)** — settings.json persistence, public theme-read route, localhost-only
   write route, ~10 presets + Randomize, applied across all pages.
3. **T4 + T5** — custom colors + per-page sync toggle.
4. **X2 — landing page** (parallelizable any time; no backend dependency).
5. **S2 + S3** — ✅ DONE. Profile fields + integrations hub (full OAuth for Twitch/YouTube/Discord/
   GitHub) shipped; see §3.2.
6. **G1 + G2** — ✅ DONE. Share page (`/share`) + server-rendered OG/Twitter card PNGs
   (`/share/card.png?kind=stats|join`); see §3.3.
7. **[LATER] bucket** — Discord, auto-post, embed widget, MCP, hosted accounts — each needs its own
   design pass and an external decision before planning. The platform half (publisher → hosted
   profile → embed → accounts → custom domains) is now sequenced in **§6.9**.

---

## 6. Product direction — from local tool to hosted platform (2026-06-11)

> Captured from a product/architecture session. This is the **forward direction**; where it refines
> the older "optionally deploy the whole app to Vercel" framing (§1 pillar 2, X1), **this wins.**
> **Nothing here is built yet** — it's the target the [LATER] items (X1, X4, G4, G3) now serve, and
> none of it should be built without an explicit go-ahead. The one near-term, safe piece is §6.8.
> The **implementation plan + hosting cost economics** live in **`docs/PLATFORM_PLAN.md`** (two
> tracks: A = "VibeLog for me, 24/7 on a custom domain" now; B = the multi-tenant product).

### 6.1 The core split — collecting ≠ showing

VibeLog does two jobs that belong in different places:

- **Collecting** (must stay local): reads git, ccusage, OBS, your OAuth'd socials. Needs your
  machine + your keys. Never moves to the cloud.
- **Showing** (should be hosted): the public profile a viewer sees — must work **24/7, even when
  your machine is off**.

Today both live in one local process, so "showing" is trapped behind "collecting." The fix: the
local process becomes a **publisher**.

### 6.2 Architecture — the local agent as publisher

```
LOCAL (your machine, default: nothing leaves)        HOSTED (the deployable piece)      YOUR SITE
┌───────────────────────────┐   publish              ┌──────────────────────┐  embed   ┌───────────┐
│ agent (`vibe start`):      │ ──sanitized snapshot──▶│ stores snapshots     │◀─iframe──│ natebuilds│
│  git/ccusage/OBS/OAuth     │   (buildShareData      │ serves /u/<handle>   │  /CNAME  │  .dev/    │
│  → summarize → redact+cap  │    surface only)       │ + embed.js + API     │          │  vibelog  │
│  → LiveState → overlay     │                        └──────────────────────┘          └───────────┘
└───────────────────────────┘                                   ▲                       viewer: no login
   secrets stay here                                       owner signs in once
```

- **Overlay** — stays 100% local, in-stream (OBS → localhost). Unchanged.
- **Local agent** (`src/agent.ts`, what `vibe start` launches; the overlay is a page *it* serves) —
  collects, drives the overlay, and *if the user opts in* publishes a **sanitized public snapshot**:
  the existing `buildShareData` surface (the 4 sanitised profile fields + numeric `LiveState` stats +
  resolved theme vars — no prompts, paths, diffs, or keys).
- **Hosted service** (Vercel + a KV/blob store) — stores each user's latest snapshot; serves their
  public profile + the embed widget + custom-domain support.
- **Viewer** — sees the profile; logs into nothing.

This *strengthens* the core invariant: the cloud only ever holds the already-public surface.

### 6.3 What `/live` becomes

The public, always-on face of a user's VibeLog, with two states:

- **Live now** → "🔴 building X right now" + stream link (snapshots push more often).
- **Offline** → degrades to the public dashboard (year calendar + stats + streak).

The **private dashboard stays local** (in-progress features, raw data, settings). The public version
is the snapshot — same UI, different data source + audience.

### 6.4 Delivery — embed widget + custom subdomain (both)

VibeLog ships as something you bolt onto **your own** site, not a destination:

1. **Embed widget** (easy, zero-DNS) — an `<iframe>`/`<script>` on any page of your site, so
   `natebuilds.dev/vibelog` is just a page of *your* site containing it. Works on any host. Carries
   a small "⚡ powered by VibeLog" badge on the free tier (this is the viral loop). (= **G4**.)
2. **Custom subdomain** (native-feeling) — CNAME `vibelog.natebuilds.dev` → the hosted app, auto-SSL.
   The Notion/Substack "bring your own domain" model. Paid (see §6.6).

### 6.5 Two auths, never confused

- **Owner auth** — once, by the user: claim an `@handle`, connect socials (OAuth; tokens stay local
  in chmod-600 files), pair the local agent so it can publish. (= **X4**.)
- **Viewer auth** — **none.** The profile is public like a portfolio. Embedded Twitch/YouTube players
  are public iframes: a visitor never logs in or subscribes. The owner's OAuth is *only* how the
  agent **knows** you're live + which video id to embed — that derived `{live, platform, videoId,
  followers}` rides in the snapshot; the embed itself is a public player needing no token.

### 6.6 Business model — open-core / freemium

Open-source the local agent: it's the cheap part to give away, and giving it away *is* the trust that
fills the funnel. Charge for the hard-to-run parts — hosting, convenience, and the network.

| Free + open source (local agent) | Paid (hosted cloud) |
|---|---|
| Collects your stats | Hosted 24/7 — profile up when your laptop's off |
| Drives your OBS overlay | **Custom domain** (`vibelog.natebuilds.dev`) + SSL |
| Local LLM / template / BYO-key | Remove "powered by" branding |
| Publishes a snapshot *if you opt in* | Unlimited history + profile analytics |
| Self-hostable end-to-end | The `@handle` network + discovery (can't self-host a network effect) |

**Hero upsell = custom domain + remove branding + unlimited history** (Pro, ~$6–8/mo). **Teams/org**
dashboards later (B2B — where the real revenue is). The free embed's "powered by" badge is the
growth engine (Calendly/Linktree flywheel). Comps to copy: **WakaTime** (near-exact — coding-time
tracking, public profiles, freemium history), plus Plausible / PostHog / Cal.com / Ghost / Sentry
(open code, paid hosting).

### 6.7 Trust model (a feature, not just docs)

The pitch: **"Local-first. Open source. Nothing leaves your machine unless you publish — and you can
see exactly what does."** Backed by:

1. **Open source** — auditable; the answer to "is this a keylogger." It reads git *commits*, token
   *counts*, and OBS *state* — not keystrokes. The only free-text field (prompt → label) is
   `redact()`'d + 140-char-capped and can be turned off entirely (template mode, §6.8).
2. **Local-first, cloud opt-in** — the default uploads nothing; publishing is a deliberate step.
3. **Preview-the-snapshot** — a screen showing the literal JSON that would be published, before it is
   (`/state.json` is the seed for this).
4. **Bring-your-own-keys** — API keys + OAuth tokens stay in chmod-600 `~/.vibelog/secrets.json`,
   read locally, never sent. You can't leak what you never receive.
5. **Self-hostable cloud** — for the paranoid / enterprises; the ultimate "don't even trust our
   servers" escape hatch.

### 6.8 Local LLM summarizer (near-term — safe to build now)

`src/summarize.ts` today = Gemini Flash-Lite (`callGemini`) + a pure-local `templateSummary()`
fallback (no AI: strips code/filler, title-cases the first meaningful line — deterministic, runs
when there's no key / on error / on timeout). Add a third path: an **OpenAI-compatible** backend
(`POST {baseUrl}/v1/chat/completions`) that covers **both Ollama** (`http://localhost:11434/v1`, the
documented default) **and LM Studio** (`http://localhost:1234/v1`) with one code path — the user
just sets a base URL + model. Config: a `summarizer` block (`provider: gemini|local|template`,
`baseUrl`, `model`) in `settings.json`; extend `Summary["source"]` to `"local"`; keep `sanitizeLabel`
+ the template fallback wrapping. A 3B model (`llama3.2:3b`, `qwen2.5:3b`) is plenty for one-line
labels, making the privacy story airtight (even the label never leaves the box). **No new deps.**
**Onboarding default:** Gemini (BYO free-tier key) is the zero-friction on-ramp; nudge users toward
the **local LLM** as the privacy upgrade once they're comfortable; the template fallback is always
there with no key at all.

### 6.9 Sequencing (platform build order)

1. **Local LLM summarizer (§6.8)** — small, self-contained, strengthens the free-tier privacy pitch.
   *[ready to build on go-ahead]*
2. **Snapshot publisher + minimal hosted profile** — agent pushes the snapshot; hosted app serves a
   read-only `/u/<handle>`. The foundational platform step (the X1 deploy story).
3. **Embed widget (G4)** on top of the hosted profile — the viral, free, badge-carrying surface.
4. **Owner accounts (X4)** — `@handle` claiming + agent pairing (owner auth only).
5. **Custom domains** — CNAME + auto-SSL; the hero paid upsell.
6. **Teams** — B2B org dashboards, later.
