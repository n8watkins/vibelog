# VibeLog — Product / Hosting / Business FAQ

`docs/FAQ.md` — status: **decision log** · **Last reviewed: 2026-06-11**

> A Q&A capture of the product/architecture/business decisions worked out in design sessions, so
> agents (and Nathan) can reference answers instead of re-deriving them from code each time.
>
> **Freshness check:** the *direction* source-of-truth is `VISION.md §6`; the *implementation +
> economics* source-of-truth is `PLATFORM_PLAN.md`. If those have changed since the "Last reviewed"
> date above, re-sync this file. To see when this file last changed: `git log -1 -- docs/FAQ.md`.
> Code-specific claims (file names, routes) should still be verified against the current code before
> acting — this file is a reasoning shortcut, not a substitute for the code.

---

## A. Product & architecture

**Q: What is VibeLog in one line?**
A local-first OBS-overlay coding/streaming telemetry tool — one local Node/tsx process serves a live
overlay (OBS), a private dashboard, a public `/live` page, and `/share` cards. See `VISION.md §1`.

**Q: We want everyone to have their own VibeLog viewable 24/7 — why can't we just deploy the whole
thing to Vercel?**
Because VibeLog does two different jobs and only one belongs in the cloud:
- **Collecting** stats (git, ccusage, OBS WebSocket, your OAuth'd socials) *must* be local — it reads
  your machine and your keys. Vercel functions are stateless/ephemeral and can't poll your laptop.
- **Showing** stats *should* be hosted so a viewer sees your page even when your machine is off.
Today both live in one local process, trapping "showing" behind "collecting." Fix: the local process
becomes a **publisher**. (`VISION.md §6.1`)

**Q: What's the publisher model / the end-to-end flow?**
Local agent collects → summarizes + `redact()`s → updates `LiveState` (drives the local overlay) →
builds a sanitized public snapshot (`buildShareData`: profile fields + numeric stats + theme, no
prompts/paths/keys) → **publishes** it (token-authed POST) to a thin cloud endpoint → the cloud
stores + serves it 24/7 → a visitor sees it on a custom domain, no login. Full step list:
`PLATFORM_PLAN.md §0.1`.

**Q: What *is* the "local agent"? How do people get it?**
It's VibeLog itself — `src/agent.ts`, launched by `vibe start`; the overlay is a page *it* serves.
Delivery: devs via `npm i -g vibelog` / `npx`; non-devs eventually via a packaged desktop app
(Tauri/Electron). The local agent + overlay is the free core and needs no account.

**Q: What's the V1 MVP?**
"Nathan's VibeLog, live on his own domain, 24/7, for $0" = Track A1 + the local-LLM option. No
accounts, billing, multi-tenancy, or embed — those are Phase 2+. Build this first. (`PLATFORM_PLAN.md
§7.1`)

**Q: What is `/live` supposed to be?**
The public, always-on face of a user's VibeLog, with two states: **live now** ("🔴 building X" +
stream link) and **offline** (degrades to the public dashboard — calendar, stats, streak). The
*private* dashboard stays local; the public one is the snapshot. (`VISION.md §6.3`)

---

## B. Delivery & domains

**Q: How do people put VibeLog on their own site? (three options)**
1. **Embed widget** — paste a `<script>`/`<iframe>` *inside an existing page* of your site, so
   `n8builds.dev` shows the stats inline. Zero DNS. Easiest; probably what Nathan wants personally.
2. **Custom subdomain** — `vibelog.n8builds.dev` via a CNAME → our servers + auto-SSL. The
   native-feeling, paid option. The user picks the label (`vibelog.`/`live.`/`building.`).
3. **Static export** (optional future) — agent emits a self-contained snapshot you commit into your
   own site build. Fully yours, but not auto-live. (`VISION.md §6.4`)

**Q: What's the difference between a subdomain and a URL path, and why does the MVP use a subdomain?**
A URL has three parts after `https://`: the **hostname** (everything before the first `/`) and the
**path** (everything from that `/` onward). In `vibelog.n8builds.dev/live`, `vibelog.` is the
subdomain, `n8builds.dev` is the domain, and `/live` is the path.

- **Subdomain** = a prefix on the hostname itself. DNS routes *hostnames*, so a subdomain can point at a
  completely different server — *a separate storefront with its own address.*
- **Path** = what comes after the domain. DNS never sees paths, only hostnames, so `/vibelog` is always
  served by whatever already handles the bare domain — *a department inside the same store.*

The MVP uses **`vibelog.n8builds.dev`** (subdomain) for two concrete reasons:
1. **Cloudflare Worker routing attaches to a hostname.** A subdomain gets a single route + auto-SSL
   pointing straight at the Worker. A path (`n8builds.dev/vibelog`) instead requires the main site to
   reverse-proxy `/vibelog/*` to the Worker — more moving parts, and usually not under our control.
2. **`public/live.html` fetches absolute paths** (`/state.json`, `/api/profile.json`,
   `/api/theme.json`). On a subdomain those paths sit at the root and work unchanged. Under a path they
   would become `…/vibelog/state.json`, and every `fetch()` would 404 unless the client were rewritten
   to prefix `/vibelog` throughout.

(Decided 2026-06-11; see `HANDOFF.md §5` and `SNAPSHOT_CONTRACT.md`.)

**Q: A path like `n8builds.dev/vibelog` — can we do that with DNS?**
No — DNS works at the host level, not the path level; you can't CNAME a path. `/vibelog` is either an
**embed** (a page on their site containing the widget) or a **reverse proxy** on their side.

**Q: If *we* host it, how can it live on *their* domain (`vibelog.n8builds.dev`)?**
Because **owning a domain ≠ hosting the content.** DNS is just a signpost. The user, who owns
`n8builds.dev`, adds a **CNAME** that forwards one subdomain to our servers — like call-forwarding:
people dial *their* number, *our* service answers, the number stays theirs. We hold the content; the
address stays theirs.

**Q: Is that a "redirect"?**
No. A redirect (301/302) bounces the visitor to a *different* URL — kills the brand. Custom-domain
mapping *serves* the content under their hostname; the address bar stays on their domain. Never reach
for a redirect here.

**Q: Who owns the DNS — VibeLog or the user? Depends which option:**
- `<handle>.vibelog.app` (free vendor subdomain) → **VibeLog** owns that DNS; zero setup for the user.
- `vibelog.n8builds.dev` (paid custom domain) → **the user** owns the DNS and points one subdomain
  at us via CNAME.
- Widget inside their page → the user's site serves the page; we just serve the widget data.

**Q: Can people self-host instead of paying us?**
Yes — it's open source. A technical user runs the thin snapshot Worker themselves on their own free
Cloudflare/Vercel + their own domain, for **$0** — but they do the setup, DNS, SSL, and keeping the
code updated. This DIY path is also a trust feature ("you don't even have to trust our servers").

**Q: So what's the "plug-and-play, hosted for a couple bucks" pitch?**
The managed convenience: sign in → claim a handle → paste a publish token into your local agent →
done. We handle uptime, SSL, updates, scaling, and (paid) the custom-domain mapping. People pay to
**not do the work** — the open-core model: code is free, convenience is paid.

---

## C. Auth & trust

**Q: Do viewers need to log in? Do they need to subscribe to see an embedded Twitch/YouTube?**
No, and no. The public page is like a portfolio — viewers log into nothing. Embedded Twitch/YouTube
players are **public iframes** that load directly from those platforms; a visitor never logs in or
subscribes, and the embeds cost us $0. (`VISION.md §6.5`)

**Q: The two auths?**
- **Owner auth** (once): claim an `@handle`, connect socials via OAuth (tokens stay local), pair the
  local agent to publish.
- **Viewer auth**: none. The owner's OAuth is *only* how the agent knows you're live + which video to
  embed; that derived `{live, platform, videoId, followers}` rides in the snapshot.

**Q: Is this a keylogger? What does it actually read?**
No. It reads git **commits**, token **counts** (ccusage), and OBS **state** — not keystrokes. The one
free-text field (prompt → label) is `redact()`'d + 140-char-capped and can be turned off entirely
(template mode). (`VISION.md §6.7`)

**Q: How do we convince a stranger to trust it?**
1. **Open source** (auditable — the answer to "is this spyware"). 2. **Local-first, cloud opt-in**
(default uploads nothing). 3. **Preview-the-snapshot** (show the literal JSON before publishing;
`/state.json` is the seed). 4. **Bring-your-own-keys** (chmod-600 `secrets.json`, never sent).
5. **Self-hostable cloud**. Tagline: *"Local-first. Open source. Nothing leaves your machine unless
you publish — and you can see exactly what does."* (`VISION.md §6.7`)

**Q: Do users need an LLM? What's the template fallback?**
LLM is optional. `src/summarize.ts` has three paths: Gemini Flash-Lite (BYO key), a future
OpenAI-compatible **local LLM** (Ollama / LM Studio, one code path), or the **template fallback** —
pure string surgery (strip code/filler, title-case the first line, no network). Fully functional with
zero AI. (`VISION.md §6.8`)

---

## D. Business & cost

**Q: It's open source — what's the upsell?**
Open-core: you don't sell the code, you sell **not having to run the server.** Free = the local agent
(the cheap, trust-building part). Paid = hosting + convenience + the network: custom domain, remove
"powered by" branding, unlimited history, analytics, Teams. Comps: WakaTime, Plausible, PostHog,
Cal.com, Ghost, Sentry. (`VISION.md §6.6`)

**Q: The tiers?**
- **Free + open**: local agent, overlay, hosted profile (badged), embed widget (badged), recent
  history, self-hostable.
- **Pro (~$6–8/mo)**: custom domain, remove branding, unlimited history, profile analytics, richer
  live embed, pro themes/custom CSS.
- **Teams (later, B2B)**: org dashboards — the fat-margin tier.
Hero upsell = **custom domain + remove branding + unlimited history**.

**Q: How much to host ~30,000 users?**
~**$30–300/mo** on a zero-egress CDN (Cloudflare Workers + R2/KV) — because the heavy work runs on
users' machines; the cloud only stores/serves small cacheable snapshots. **Don't serve public pages
from Vercel's metered bandwidth** (could hit $1,000s/mo at scale). Storage for 30k ≈ ~3 GB ≈ cents.
(`PLATFORM_PLAN.md §5`)

**Q: Does freemium actually work? Who pays?**
The cost side is a non-issue (>90% margin at 1–3% conversion: 2% of 30k × $7/mo ≈ $50k/yr vs ~$300/mo
cost). People pay to make it *theirs* (custom domain/branding/history). The free embed's "powered by"
badge is the **growth engine** — each free user is a billboard, so free users have negative effective
cost if even ~1% convert. Teams/B2B is the real revenue later. (`PLATFORM_PLAN.md §5`)

**Q: Can it be $0 for just me?**
Yes. Cloudflare free tier (Workers 100k req/day, KV 100k reads + 1k writes/day + 1 GB, free custom
domain + SSL) covers a personal VibeLog. Only respect the **1k KV writes/day** limit (throttle
publishes to ~every 2 min / on-change). The sole real cost is the **domain renewal** (~$10–15/yr),
not a Cloudflare charge. (`PLATFORM_PLAN.md §5`)

**Q: Do we make a separate Worker per person? What drives cost at scale?**
No — **one Worker** (deployed once) serves everyone; it reads the hostname/`/u/<handle>` per request
and fetches that user's snapshot from storage keyed per user (`snapshot:<handle>`). Cost is **operation
count, not bandwidth (free on Cloudflare) or storage (pennies)**, ranked: (1) **writes/publishes** —
the ~10×-pricier KV op and the #1 controllable driver; tame it with write-on-change + throttle +
publish-faster-only-while-live; (2) **page-view requests** — big number but cheap and **edge-cacheable**
(snapshots change only on publish); (3) **custom hostnames** — only paying users, self-funding; (4)
storage — pennies. Realistic ~30k users ≈ $100–150/mo, dominated by writes. (`PLATFORM_PLAN.md §5`)

**Q: Cost guardrails as we grow?**
Keep the snapshot small; **publisher writes on-change + throttled**; **edge-cache reads**; **never
proxy video through our servers** (Twitch/YouTube embeds load direct = $0). Those keep cost flat at scale.

**Q: LLM onboarding default + flexibility?**
Gemini (BYO free-tier key) = zero-friction on-ramp; nudge users to a **local LLM** as the privacy
upgrade once comfortable; template fallback always available with no key. **Flexible:** if a user
already runs a local LLM, auto-detect Ollama/LM Studio or let them point at any OpenAI-compatible base
URL + model. (`VISION.md §6.8`, decision in `PLATFORM_PLAN.md §7.3`)

**Q: Publish cadence as price discrimination?**
Yes — the throttle interval *is* the paywall. Free = publish only **while live**, **on-change**,
throttled to **~5–10 min**; Pro = **~30–60 s** (near-real-time). Almost free to implement and it
directly bounds the #1 cost driver (writes). (`VISION.md §6.6`, `PLATFORM_PLAN.md §5/§7.3`)

---

## E. Glossary (the web/DNS/hosting basics)

- **Domain** — the address you rent (`n8builds.dev`).
- **Registrar** — where you buy/manage the domain (Namecheap, Cloudflare, GoDaddy).
- **DNS** — the phonebook translating a name → a server address.
- **A record** — points a name at an IP. **CNAME** — points a name at *another name* (the "forward my
  subdomain to someone else's server" trick).
- **Subdomain** — the prefix (`vibelog.` in `vibelog.n8builds.dev`); free, make as many as you like.
- **Hosting / server / "edge"** — the computer holding/serving the content. Separate from owning the name.
- **SSL/TLS** — the encryption behind `https://` + the 🔒. **Certificate** — the file proving a server
  may serve a hostname. **ACME / Let's Encrypt** — the free automated system that issues certs.
- **SNI** — lets one server hold certs for many hostnames (key to hosting many custom domains).
- **Host header** — the hostname the visitor typed; the server reads it to pick whose content to serve.
- **Redirect (301/302)** — bounce the browser to a different URL (changes the address bar).
- **Reverse proxy** — silently forward a request to another server *without* changing the URL.
- **iframe** — embed another page inside yours, in a box. **`<script>` embed** — JS that draws content
  directly into your page (no box). **CDN** — a worldwide cache network that serves content fast/close.

---

## F. Where the canonical detail lives

- **`VISION.md §6`** — the direction (architecture, delivery, auth, business, trust, local-LLM).
- **`PLATFORM_PLAN.md`** — the implementation plan, two tracks (A = "VibeLog for me, 24/7, $0" now;
  B = the multi-tenant product), and the hosting unit economics.
- **`INFRA_PLAN.md`** — local-agent infra invariants this builds on.
- **`HANDOFF.md`** — cold-start brief / current state.
