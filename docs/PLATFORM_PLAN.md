# VibeLog Platform Plan — local tool → hosted platform

`docs/PLATFORM_PLAN.md` — status: **proposal** (implementation plan for `docs/VISION.md §6`)

> This is the *how* for the direction set in **`VISION.md §6`** (the *what/why*). It splits the work
> into two tracks that share one architecture, and includes the hosting **unit economics**. For the
> local-agent infra invariants this builds on, see **`INFRA_PLAN.md`**. **Nothing here is built yet.**

---

## 0. The one architectural rule (read first)

**The local agent collects + publishes. The cloud only stores + serves the public snapshot.**
You never run the *collector* in the cloud — it needs your machine's git/OBS/ccusage/OAuth, which
only exist locally. The cloud is a dumb, cheap **snapshot receiver + page server**. This is what
keeps hosting nearly free (§5) and keeps the core invariant intact (the cloud only ever holds the
already-public `buildShareData` surface — no prompts, paths, diffs, or keys).

```
LOCAL agent (vibe start)                    CLOUD (thin)                  VISITOR
 collect → summarize → redact+cap            store latest snapshot         GET page (no login)
 → LiveState → overlay (local)   ──publish──▶ serve /live from snapshot ──▶ sees stats 24/7
   token-authed POST                          (reuses public/live.html
                                               + the /state.json shape)
```

---

## 1. Two tracks — don't conflate them

| | **Track A — "VibeLog for me"** | **Track B — "VibeLog the product"** |
|---|---|---|
| Tenants | 1 (you) | many |
| Goal | `vibelog.natebuilds.dev` is up 24/7 | anyone signs up + gets their own |
| Auth | one publish token | login + `@handle` + per-user tokens |
| Buildable | **now** (small, self-contained) | [LATER] — the platform |

**Track A is Track B with one user and the multi-tenant parts stubbed out.** Build A first: it ships
something real for you *and* de-risks the whole product. Then B is mostly "make A multi-tenant."

---

## 2. Track A — ship VibeLog for yourself, 24/7, on your domain

Two ways, pick by how much you care about "up when my laptop's off":

### A0 — zero code, NOT 24/7 (what exists today)
Run `vibe share` (the Cloudflare tunnel) and point `vibelog.natebuilds.dev` at the tunnel hostname.
Works right now, no new code — **but the page is down whenever your machine is off or not running.**
Fine for "show it live during a stream," not for an always-on portfolio piece.

### A1 — the real "always-on" version (small build)
1. **Local: add a publisher to the agent.** A small module that builds the snapshot (reuse
   `buildShareData` in `src/share.ts`) and `POST`s it to a configured endpoint with a token, on
   state-change + a slow interval. Config lives in `~/.vibelog/secrets.json` as
   `publish: { url, token }` (the token is a secret → secrets.json, never logged, never in state).
   This route is **outbound only** — it adds no inbound route to the local agent, so `isRemote()`
   and `PUBLIC_GET_ROUTES` are untouched.
2. **Cloud: a thin snapshot service.** Cloudflare Worker + KV (recommended) or a tiny VPS:
   - `POST /publish` — token-authed → store the snapshot (one key, since it's just you).
   - `GET /` (and `/live`, `/state.json`) — render the public page from the stored snapshot,
     reusing the existing `public/live.html` + the `/state.json` contract. No accounts, no DB.
3. **Domain + SSL.** Add a CNAME `vibelog.natebuilds.dev → <the service>`; SSL auto-provisions
   (Cloudflare/Vercel). Done — your VibeLog is live on your brand, 24/7.

**"Super access"** here is just the publish token: only your agent can overwrite your stats. Viewing
is public and needs nothing. **Cost for just you: ~$0** (Cloudflare free tier) **to ~$5/mo.**

---

## 3. Track B — the product (built ON TOP of Track A)

Everything in A, plus the multi-tenant skin (full sequencing in **`VISION.md §6.9`**):

1. **Multi-tenancy** — snapshots keyed by user; `GET /u/<handle>` serves the right one.
2. **Owner accounts (X4)** — "log in with Google/GitHub," claim an `@handle`, issue a publish token
   that pairs the user's local agent. Viewers still never log in (`VISION.md §6.5`).
3. **Free vendor subdomains** — `<handle>.vibelog.app` (we own that DNS; zero setup for the user).
4. **Embed widget (G4)** — `embed.js` + a compact widget render with a "⚡ powered by VibeLog" badge
   (the viral loop, `VISION.md §6.6`).
5. **Custom domains for everyone** — accept arbitrary customer CNAMEs + auto-SSL at scale via
   **Cloudflare for SaaS (Custom Hostnames)** / Vercel domains API / Approximated (`VISION.md §6.4`).
6. **Billing (Stripe)** — gate the upsell (custom domain, remove branding, unlimited history,
   analytics) behind Pro (`VISION.md §6.6`).
7. **Teams** — org dashboards, later (the B2B revenue tier).

---

## 4. How A and B differ technically (the "is it the same?" answer)

The **spine is identical**; B only swaps the single-tenant parts for multi-tenant ones:

| Layer | Track A (you) | Track B (product) | Same? |
|---|---|---|---|
| Collector (local agent) | local | local | **identical** |
| Publisher | POST snapshot + token | POST snapshot + per-user token | nearly identical |
| Snapshot store | one key | keyed by `@handle` | small change |
| Auth | one shared token | login + handle namespace + tokens | **the big add** |
| Page serving | `GET /` | `GET /u/<handle>` + `embed.js` | small change |
| Domains | one hardcoded CNAME | arbitrary customer CNAMEs + auto-SSL | **infra add** |
| Billing | none | Stripe + plan gates | **new** |

**Punchline:** building A is genuinely a working prototype of B. You are not throwing work away.

---

## 5. Unit economics & hosting cost

**Why it's cheap:** the expensive work (reading git/ccusage/OBS, summarizing) runs on each user's own
machine. The cloud only stores small JSON snapshots and serves light, cacheable pages — closer to
"hosting static files" than "running a SaaS."

**Cost at ~30,000 users** (estimates, back-of-envelope):
- **Storage:** ~100 KB snapshot × 30k = **~3 GB** → cents/month. Even 1 MB each ≈ 30 GB ≈ a few $.
- **Serving:** snapshots only change when a user *publishes*, so they cache hard at the edge.

| Stack | Egress | ~30k users serving snapshots |
|---|---|---|
| **Cloudflare** (Workers + R2 + KV) | **$0 — no egress fees** | **~$20–100/mo** (request-bound, not GB) |
| **Vercel** (for *serving* public pages) | metered, ~$0.15/GB after 1 TB | can hit **$1,000s/mo** at scale ❌ |

→ **Serve the public pages from a zero-egress CDN (Cloudflare), not Vercel's bandwidth.** Effective
cost ≈ **$0.001–$0.01 per free user / month** → 30k users ≈ **$30–300/mo total.**

**Does freemium work? (who pays):** the cost side is a non-issue; the lever is conversion + growth.

| Conversion | Paying (of 30k) | Revenue @ $7/mo | vs ~$300/mo cost |
|---|---|---|---|
| 1% | 300 | $2,100/mo (~$25k/yr) | 7× |
| 2% | 600 | $4,200/mo (~$50k/yr) | 14× |
| 3% | 900 | $6,300/mo (~$75k/yr) | 21× |

Gross margin **>90%** at every row. People pay to make it *theirs* (custom domain, remove branding,
unlimited history, analytics) — proven by Linktree Pro / Substack / WakaTime. **Teams/B2B** is the
fat-margin tier later. The free embed's **"powered by" badge is marketing, not just cost** — each
free user is a billboard, so free users have *negative* effective cost if even ~1% convert.

**Cost guardrails (keep it flat as you grow):**
- Keep the snapshot small (numeric stats + a few profile fields + theme + ~1yr calendar).
- **Never proxy video through your servers** — embedded Twitch/YouTube players load *directly from
  Twitch/YouTube*, costing you $0. Piping media through your infra is the one thing that breaks the math.

---

## 6. What I need from you

**To do Track A now (your VibeLog, 24/7, on `vibelog.natebuilds.dev`):**
1. **Go-ahead** on A1 (the always-on build) vs. A0 (zero-code tunnel, not 24/7).
2. **A Cloudflare account** (free) — recommended host (zero egress + does custom-domain SSL for you).
3. **DNS access for `natebuilds.dev`** at your registrar — to add the one CNAME (you do this; I can
   give you the exact record).
4. Decide the subdomain label (`vibelog.` / `live.` / `building.` — your call, `VISION.md §6.4`).
5. *(optional)* If you want the AI summary in the cloud snapshot too, decide local-LLM vs Gemini
   (`VISION.md §6.8`) — orthogonal to hosting.

**Later, for Track B (the product):** pick a login provider (Google/GitHub), set Pro pricing, a
Stripe account, and the `vibelog.app` domain. None of this is needed for Track A.

---

## 7. Suggested first PRs

1. **Local-LLM summarizer** (`VISION.md §6.8`) — small, self-contained, strengthens the privacy pitch.
2. **Publisher module** in the agent (build snapshot via `buildShareData` → token-authed `POST`).
3. **Thin snapshot service** (Cloudflare Worker + KV) reusing `live.html` + the `/state.json` shape.
4. **Wire `vibelog.natebuilds.dev`** (CNAME + auto-SSL) → Track A is live.
5. *(then B)* multi-tenancy → accounts/`@handle` → embed widget → custom-domains-for-all → billing.
