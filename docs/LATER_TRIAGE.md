# VibeLog — [LATER] Roadmap Triage (advisory)

`docs/LATER_TRIAGE.md` — **advisory product triage, dated 2026-06-11. Not a commitment.**
`docs/VISION.md` remains the canonical roadmap; if anything here disagrees with it, **VISION wins.**
Several [LATER] items (X1/X4/G4) are now **sequenced** into the platform plan — see `VISION.md §6` +
`PLATFORM_PLAN.md §7.2` (phases). This file stays as the deeper per-item DO-SOON/PARK/KILL rationale.

This is a strategic "what's good, what's not, what to kill" pass over the entire **[LATER]**
bucket (VISION §3.3 G3/G4, §3.4 D1–D3, §3.5 X1/X3/X4) plus a note on §3.6 Parked. Each verdict
is one of **DO-SOON**, **MAYBE / CONDITIONAL**, **PARK**, or **KILL**. Feasibility claims are
grounded in the code as it stands (`src/agent.ts`, `src/oauth.ts`, `src/share.ts`, `src/state.ts`,
`src/theme.ts`).

The single load-bearing lens throughout: **does this keep VibeLog a one-process local binary, or
does it pull it toward a hosted multi-user SaaS?** The streaming-safety invariants
(`PUBLIC_GET_ROUTES` allowlist + `isRemote()` 403, keys only in `~/.vibelog/secrets.json`, derived
`connected` state, public surface = theme vars + four profile fields + numeric stats) are the wall
most of these items get measured against.

---

## The items

### G3 — Auto-post a daily-stats card to Twitter/X

**What it is.** Connect Twitter/X and (optionally, on consent) auto-post a daily-stats share card
on a cadence.

**Imagined build-out.** The whole *image* half is already shipped: `GET /share/card.png?kind=stats`
renders a 1200×630 PNG from public-only data (`buildShareData` in `src/agent.ts` + `src/share.ts`).
The MVP is small: add `x` (or reuse a Twitter app) to the OAuth provider table in `src/oauth.ts`
with **write** scope (`tweet.write` / `media.write` / OAuth2 PKCE), a localhost-only
`POST /api/share/post` that renders the card and posts it, and a dashboard "Post today's card"
button. Full vision adds an opt-in scheduler ("post a recap at stream-end / 9pm daily") and a
consent + preview gate so nothing ever auto-fires silently.

**Fit with the ethos.** Coheres *as a manual, localhost-triggered action* — the post is the user
pushing their own already-public card outward, the agent stays local, nothing new is exposed over
the tunnel. The tension is **auto-posting**: an unattended cron that tweets on the user's behalf is
exactly the kind of background side-effect a local-first tool should make the user pull, not push.

**Dependencies / prereqs.** Twitter/X API access (the v2 write tier is now paid/gated — the real
blocker, external to the code); a write-scoped OAuth provider (today every provider in `oauth.ts`
is deliberately read-only: `identify`, `read:user`, `youtube.readonly`); token-refresh for non-Twitch
providers (HANDOFF §5 flags this is still unbuilt — only `twitch-oauth.ts` auto-refreshes).

**Security/privacy risk.** Moderate-and-new-in-kind. It's the **first write-scoped third-party
token** and the **first route that mutates the outside world**. It must stay localhost-only (a
`POST`, never in `PUBLIC_GET_ROUTES`), the token stays in the chmod-600 store, and an auto-cadence
needs a hard consent gate. The card content itself is already public-safe, so the exfil surface is
unchanged — the risk is entirely "acting on the user's behalf."

**Effort.** **M** — image done; the cost is the X API tier, a write OAuth scope + PKCE, and refresh.

**Verdict.** **MAYBE / CONDITIONAL.** Build the *manual* "Post today's card" button if/when the
user actually has X API write access; ship the scheduler only behind an explicit opt-in. Trigger =
the user wants one-tap posting **and** has a usable API tier. Do **not** build the auto-cadence first.

---

### G4 — Embeddable widget

**What it is.** A public, read-only, themed widget (compact stat strip or mini-dashboard) the user
can iframe onto another site (personal homepage, blog, Twitch panel).

**Imagined build-out.** MVP is a single new public route — `GET /widget` — serving a tiny themed HTML
page that reads the *already-public* `/state.json` + `/api/theme.json`, sized for an iframe, with no
chrome. It reuses the exact public surface `/live` and `/share` already stand on. Add it to
`PUBLIC_GET_ROUTES`, set permissive framing headers for that route only, give an embed-snippet
copy-button on the dashboard. Full vision: size/metric variants (`?layout=strip|card`,
`?metrics=...`) and a stable embed contract.

**Fit with the ethos.** Strong fit, *but* it only works over the network when `vibe share` is
running, and a Cloudflare quick-tunnel URL is ephemeral — so the persistent-embed story implicitly
wants the X1 deploy / a stable hostname. As a local-only OBS-style embed it's fine; as a
"put it on my website forever" widget it leans on hosting.

**Dependencies / prereqs.** Nothing new server-side beyond the route — the public data surface
already exists. The *useful* version depends on a stable public URL (→ X1).

**Security/privacy risk.** Low, if disciplined. No new data leaves the box (same surface as `/live`).
The only real concern is framing/CORS headers — scope relaxed framing to `/widget` only, never
loosen the global `isRemote()` gate or add a write path. No new tokens, no new private data.

**Effort.** **S** for the local MVP (one static themed route + an embed snippet); **M** once you add
layout variants and lean on a stable URL.

**Verdict.** **MAYBE / CONDITIONAL.** Genuinely cheap and on-ethos, but its value is gated on a
persistent public URL. Condition = X1 ships (or the user pins a tunnel hostname). Until then most of
its value is already captured by `/share` + the OG card.

---

### D1 — Connect a Discord server (incl. create-a-server / modify existing)

**What it is.** From the dashboard, link a Discord server — including a button to *create* one if you
don't have it, and edit an existing one.

**Imagined build-out.** Discord is already a connected provider in `oauth.ts` (scope `identify`,
read-only). The full version means escalating to `bot` + `guilds`/`manage` scopes, running (or
bundling) a Discord **bot application**, and a server-management UI. Creating a server via API
requires a bot token with elevated permissions; modifying one needs channel/role write scopes.

**Fit with the ethos.** **Poor for the create/manage half.** This turns a local telemetry overlay
into a Discord server-administration console — a large, unrelated surface that wants a privileged
bot token sitting in the local store and a write relationship with a third-party platform. It's
scope creep away from "stream your development." The *connect* (read-only identify) half already
exists and is fine.

**Dependencies / prereqs.** A registered Discord **bot** (not just an OAuth app), elevated scopes,
a bot-hosting story (a bot that only runs while the laptop is on is a weak product), and a reason
the management belongs in VibeLog at all vs. Discord's own UI.

**Security/privacy risk.** High-ceiling. A bot/manage token is far more dangerous than a read token
if it ever leaked on-stream — it can mutate a live community. Server-management writes against a
third party are exactly what the invariants are built to keep off the public surface.

**Effort.** **L–XL** for create/manage; the read-only connect is already **DONE**.

**Verdict.** **KILL the create/manage scope; PARK the rest under D2.** "Create and modify Discord
servers" doesn't belong in a streaming telemetry tool — Discord's own UI does it better and the
privileged token is a liability. Drop it from the roadmap as a first-class item; any Discord value
lives in D2's outbound notifications.

---

### D2 — Discord notifications ("going live", daily recap)

**What it is.** VibeLog posts to a Discord channel on events: "now live," end-of-stream recap.

**Imagined build-out.** The clean, on-ethos MVP needs **no bot and no OAuth at all**: a single
user-pasted **incoming webhook URL** (stored in `secrets.json`), and the agent POSTs a message when
its existing signals fire — it already knows `live_started`/`live_ended` (the OBS bridge in
`src/agent.ts`) and can attach the existing `/share/card.png`. Full vision: configurable templates +
which events fire, in the Settings sheet.

**Fit with the ethos.** Good fit, done the webhook way. It's purely **outbound** from the local
agent, reuses existing live-state signals and the existing public card, needs no inbound public
route, and stores one user-provided secret (not an issued third-party token). It's the natural
"share my stream" extension that stays local.

**Dependencies / prereqs.** A `discord.webhookUrl` field in `secrets.json` + a small settings UI;
the live-event hooks already exist; the share card already exists. No bot, no elevated scopes.

**Security/privacy risk.** Low. Outbound webhook; no new public route; the message is built from
already-public state. Keep the webhook URL in the chmod-600 secrets file (it's a write-capable
secret, so never log or echo it) and rate-limit so a flapping OBS connection can't spam the channel.

**Effort.** **S–M** via webhooks; **L** only if you insist on a full bot (don't, for the MVP).

**Verdict.** **MAYBE / CONDITIONAL — and the best Discord item by far.** Condition = the user wants
their community pinged on going-live. Ship the webhook version; skip the bot. This is where Discord
energy should go instead of D1.

---

### D3 — Suggestion-box front-end (fold in Nathan's private project)

**What it is.** A dashboard front-end to browse/triage stream suggestions, eventually folding in
Nathan's **separate private project** (suggestion box + Discord bot/automations) as an optional
module.

**Imagined build-out.** A dashboard panel listing suggestions with triage actions, reading from
whatever store the private project uses. Because the source project is private and external, the
"good version" is really a **clean module boundary**: an optional adapter the agent loads if present,
not core code — keeping VibeLog shippable to others who don't have that backend.

**Fit with the ethos.** Conditional. As an *optional, local* module it's fine and even nice. The
risk is coupling: if VibeLog starts depending on a private Discord-bot backend, it stops being a
thing other people can `vibe init` and run. The intent ("leave architectural room," not build now)
is already the right call.

**Dependencies / prereqs.** The private project's data model + a decision on its boundary; almost
certainly D2's outbound plumbing first; realistically a place suggestions live (which edges toward
hosting if it's multi-viewer).

**Security/privacy risk.** Medium and unknowable until the private backend's shape is known —
viewer-submitted content is untrusted input that must be sanitised like profile fields before it
touches any page, and it must never widen the public surface.

**Effort.** **L** (mostly integration + boundary design, much of it outside this repo).

**Verdict.** **PARK.** Correctly captured as "not now, leave room." No trigger until the private
project is ready to be folded in and its boundary is designed. Keep it as a forward-compat note,
not a roadmap commitment.

---

### X1 — Deploy guide (public dashboard hosted, overlay stays local)

**What it is.** A step-by-step guide for deploying the public read-only view (Vercel or similar)
while the overlay/agent stay local — clarifying what runs where.

**Imagined build-out.** Not a feature, a **document + a small clarification of the boundary**: which
routes are the "public read-only view" (`PUBLIC_GET_ROUTES`), how a hosted front-end reads from the
local agent (today: `vibe share`'s Cloudflare tunnel), and what a "deploy" even means given the agent
is the source of truth. The honest MVP may be just "here's how to run `vibe share` + point a stable
hostname at it," because the live data *only* exists on the local box. A true Vercel deploy of a
*static* dashboard would show stale/cached data unless it proxies the tunnel — worth stating plainly.

**Fit with the ethos.** Directly on-ethos — it's the "optionally deployed" pillar (VISION §1.2) made
concrete, and it explicitly keeps the overlay local. It's the lowest-risk way to gesture at hosting
without becoming a SaaS.

**Dependencies / prereqs.** Mostly a decision: is "deploy" = a documented persistent tunnel, or an
actual hosted node? Everything needed to *write* the persistent-tunnel version already exists.

**The VISION/HANDOFF discrepancy.** VISION §3.5 tags X1 **[NEXT]**; HANDOFF §5 lists it under
**[LATER] — needs a user decision**. **My read: HANDOFF is right that it needs a decision, but the
decision is small, and the doc-only version is genuinely [NEXT].** The blocker isn't engineering —
it's choosing what "deploy" means. Resolve it by shipping the cheap version first: document the
persistent-tunnel path (no new code), and leave "hosted static node" as a later paragraph. So:
treat the *guide* as [NEXT], the *hosted-node* interpretation as [LATER]. This split also unblocks
G4's persistent-embed story.

**Security/privacy risk.** Low — it documents the *existing* public surface. The only risk is a guide
that accidentally tells users to expose a write route or a key-bearing route; the guide must restate
that only `PUBLIC_GET_ROUTES` is ever public and `vibe share` tunnels the whole port (so `isRemote()`
is what's protecting them).

**Effort.** **S** for the documented-tunnel guide; **M+** if it implies building a hosted node.

**Verdict.** **DO-SOON (the doc), conditional on the rest.** The persistent-tunnel guide is the
single cheapest, most on-ethos, fully-unblocked item in the bucket and it unlocks G4. Write that;
defer the "real hosting" interpretation to the X4 decision.

---

### X3 — VibeLog MCP server

**What it is.** Ship VibeLog's own MCP server so the Claude desktop app can read and modify VibeLog
(settings, theme, profile) directly.

**Imagined build-out.** A small MCP server (stdio) exposing tools like `get_theme`, `set_theme`,
`get_profile`, `set_profile`, `get_stats` — thin wrappers over the **already-existing** localhost
routes (`GET /api/settings.json`, `POST /api/settings`, `GET /api/profile.json`, `/api/dashboard.json`).
MVP = read + theme/profile write tools. Full vision = the whole settings surface, so "make my overlay
sunset-orange" works conversationally.

**Fit with the ethos.** Excellent and *characteristically* on-brand — it's local-to-local (MCP runs
on the same machine, talks to localhost), adds **no** public/tunnel surface, and exposes only the
already-localhost-only settings API. It deepens the local-first tool rather than pulling toward
hosting. This is the one [LATER] item that is purely additive with near-zero new attack surface.

**Dependencies / prereqs.** VISION §3.5 says it "needs the settings API (S1) to exist first" — **that
API now exists** (`/api/settings.json` + `POST /api/settings` shipped with S2/S3). So the stated
prereq is already met. The only real dep is the MCP SDK + deciding stdio vs. local-HTTP transport.

**Security/privacy risk.** Low, *if* the MCP server only proxies localhost and writes go through the
same `validateVars`/`sanitizeProfile` path as the HTTP route. The thing to never do: let the MCP
server read tokens/secrets or expose anything the dashboard itself can't see. Since it runs locally
and the gated routes already enforce this, the blast radius is small.

**Effort.** **M** — a self-contained new module; no changes to the security-critical request gate.

**Verdict.** **DO-SOON / strong MAYBE.** Its stated blocker (S1) is gone, it's the most on-ethos
"extensibility" item, and it's the kind of thing this user (heavy Claude Code user) would actually
use daily. Condition = the user wants conversational control of VibeLog; if yes, this is top of the
non-trivial pile.

---

### X4 — Hosted accounts / primary login ("Log in with Google", multi-user)

**What it is.** A primary identity ("Log in with Google"), then connect all accounts under it — for a
deployed, multi-user version. The old PRD Supabase/Next.js SaaS framing lives here.

**Imagined build-out.** This is not a feature, it's a **different product**: user accounts, a
database, server-side per-user secret storage, auth sessions, a hosted multi-tenant agent. There is
no "MVP" that fits the current single-process, no-DB, `~/.vibelog/`-on-disk architecture — it would
require rebuilding the data and trust model from the ground up.

**Fit with the ethos.** **Direct contradiction** of pillar §1.1 ("no account required to run the
overlay locally") and of the core invariant. Every safety property today derives from *there is one
user, on one machine, keys never leave the box*. Hosted multi-user means server-side third-party
tokens for many people — the exact thing the architecture is designed to never hold. VISION already
quarantines the Supabase framing here, away from the local-first core; that instinct is correct.

**Dependencies / prereqs.** A hosting + auth + database decision, i.e. a decision to **become a
SaaS**. Everything else (per-user isolation, secret vaulting, billing eventually) follows from that
one fork.

**Security/privacy risk.** Highest in the bucket, by far. Centralizing many users' OAuth tokens
server-side is the single biggest liability VibeLog could take on and inverts its current "no central
secret store" guarantee.

**Effort.** **XL** — effectively a rewrite / a second product.

**Verdict.** **PARK (decisively) — and explicitly fork it out of the local-first roadmap.** Not KILL,
because a hosted tier is a legitimate *future business* — but it must not sit in the same roadmap as
the local binary, because building it changes what VibeLog *is*. Trigger = a deliberate decision to
launch a hosted SaaS, at which point it gets its own design doc and probably its own repo. Until
then it should stop being one line item and be recognized as "the fork."

---

### §3.6 Parked — GitHub repo images

Noted for completeness: **already correctly killed.** Projects don't have meaningful images; do not
reintroduce. No further action — not re-litigated here.

---

## Prioritized ranking (best → worst)

1. **X1 deploy guide — DO-SOON.** Cheapest, fully unblocked, purely on-ethos (the "optionally
   deployed" pillar), doc-only in its MVP, and it unlocks G4. The §3.5/§5 discrepancy resolves in
   its favor: the *guide* is [NEXT].
2. **X3 VibeLog MCP — DO-SOON / strong MAYBE.** Its stated prereq (settings API) already shipped;
   local-to-local, zero new public surface, and the most "this user will actually use it" item.
3. **D2 Discord notifications — MAYBE/CONDITIONAL.** Outbound-only via a user webhook; no bot, no new
   public route, reuses live-events + the existing card. The right home for all Discord energy.
4. **G4 embed widget — MAYBE/CONDITIONAL.** Cheap and on-ethos, but its real value needs a persistent
   public URL (i.e. it sits *behind* X1). Local MVP is small.
5. **G3 X auto-post — MAYBE/CONDITIONAL.** Image half is done; gated on X API write access + a
   write-scoped token, and auto-cadence needs a hard consent gate. Manual button only, first.
6. **D3 suggestion box — PARK.** Correctly "leave room, don't build"; no trigger until the private
   backend's boundary is designed.
7. **X4 hosted accounts — PARK / fork out.** A different product that contradicts the local-first
   core; legitimate future business but must not share this roadmap. Needs a deliberate SaaS decision.
8. **D1 Discord create/manage — KILL (the create/manage scope).** Server administration doesn't
   belong in a telemetry overlay, wants a privileged bot token that's a stream-safety liability, and
   Discord's own UI does it better. Read-only connect already exists; drop the rest.

---

## Cross-cutting observations

- **One fork decides everything: stay a single local binary, or grow a hosted tier.** X4 *is* that
  fork; X1's "real hosting" interpretation and G4's "permanent embed" both lean on it. Recommendation:
  hold the line as a **local binary**, satisfy "public" via `vibe share` + a documented persistent
  tunnel (X1), and treat X4 as a separate product if it's ever pursued. Don't let G4/X1 quietly drag
  in hosting through the side door.
- **Natural sequencing:** X1 (doc) → unblocks G4 (persistent embed) and clarifies what "public" means
  for everything. X3 stands alone and can go anytime (prereq met). D2 (webhook) should **absorb** all
  Discord ambition; D1's create/manage and the bot-heavy reading of D2/D3 should be dropped/parked.
- **Merge/split:** *Split X1* into "[NEXT] documented-tunnel guide" vs. "[LATER] hosted node."
  *Merge* Discord: collapse D1's connect into the already-shipped integration, route D1's value into
  D2, keep D3 as a parked optional module. *Split G3* into "manual post" (buildable) vs. "auto-cadence"
  (consent-gated, later).
- **Already largely captured by shipped work:** G3's card and G4's data surface **already exist** —
  `/share/card.png` + the public `/state.json`/`/api/theme.json`. Much of these two items' value is
  realized today; what remains is a thin delivery mechanism, not a new capability. That's a strong
  argument they're smaller than their [LATER] tag implies.
- **First-of-kind risk to watch:** G3 introduces the **first write-scoped third-party token** and the
  **first outward-mutating action**; D2 introduces the **first write-capable user secret** (webhook).
  Neither breaks the invariants if kept localhost-triggered and out of `PUBLIC_GET_ROUTES`, but they're
  the first time VibeLog *acts on the outside world* rather than just reflecting state — worth a
  deliberate consent-design pass when either lands.

---

## Recommended next 1–2 (if moving ONE thing out of LATER)

1. **X1 — the persistent-tunnel deploy guide.** Smallest valuable slice: a `docs/DEPLOY.md` that
   documents running `vibe share` with a *named* Cloudflare tunnel (stable hostname), states plainly
   that the live data lives only on the local agent, and restates that **only `PUBLIC_GET_ROUTES` is
   ever public**. Zero new code, zero new risk, on-ethos, and it unblocks G4. This is the obvious
   first move.
2. **X3 — the VibeLog MCP server (read + theme/profile write).** Smallest valuable slice: a stdio MCP
   server exposing `get_stats` / `get_theme` / `set_theme` / `get_profile` / `set_profile` as thin
   wrappers over the *existing* localhost routes (writes through the same `validateVars` /
   `sanitizeProfile` path). No new public surface, prereq already met, and it's the one that most fits
   how this user already works. Pick this if the user wants a *feature*; pick X1 if they want the
   cheapest unblock.
