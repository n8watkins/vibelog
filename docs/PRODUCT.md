# VibeLog - product definition

Status: proposal, 2026-11-01, with the owner decisions of 2026-11-01 applied (see "Owner decisions" at the end).
Inputs: `docs/ASSESSMENT_2026-11.md`, `docs/MARKET_REPORT_2026-11.md`, `docs/VISION.md`.

## Positioning

**One-liner:** VibeLog shows what you are building with AI, live, with real git and token numbers, on your stream and on a public page, and nothing leaves your machine unless you publish it.

**Tagline:** Proof of work, live.

**Short pitch:**
VibeLog is a free, open-source agent that runs next to your editor.
It watches your git activity, AI token spend, stream time and channel growth, and turns them into an OBS overlay, a public live page and share cards.
There are two paths, the same model as Relink: **self-host it free** (open source, available first), or **let us host it** (a paid plan, planned) so your public page stays up when your laptop is off.

## Audience

1. **Primary: AI-assisted developers who stream** (Twitch, YouTube, Kick, X live).
   They need an on-screen HUD that explains what is happening to viewers who join mid-session.
   Small group, high intensity, and the most visible demo of the product.
2. **Secondary: build-in-public developers and indie hackers** who post progress on X, GitHub and personal sites.
   They want a living proof-of-work page and a share card they do not have to make by hand.
   This is the volume audience for the hosted tier.
3. **Later, maybe: small teams and communities** (hackathons, cohorts, streamer collectives) that want a shared board.
   Not a target until the first two are served.

Not for: managers who want to monitor developers.
VibeLog is self-reported and public by choice, which is the opposite of surveillance tooling.

## Features, grouped

### Collect (local agent, always free)

- Git activity: lines added and removed, files changed, commits, branch, per project.
- AI token spend and cost: Claude Code today; Codex, Gemini CLI and others planned.
  Dollar cost is private by default (see "Public dollar spend" below).
- Per-project attribution of tokens and commits across all your repos.
- Stream time from OBS WebSocket.
- Channel growth from Twitch and YouTube (followers, subscribers, live viewers, peaks).
- "Now building" label from your prompt via a local LLM, Gemini, or a no-AI template, always redacted and capped.
- Milestones you mark from the CLI (`vibe mark feature ...`).

### Show (local surfaces, always free)

- OBS HUD: live stats, now building, projects ticker, milestone toasts, personal-best badges.
- Private dashboard: year heatmap (AI, streaming, score modes), session, week and channel panels, settings.
- Public `/live` page with live and offline states.
- `/share` page with server-rendered 1200x630 PNG cards (stats and invite).
- Embeddable widget (`<script>` one-liner).
- Terminal recaps: `vibe report`, `vibe report week`, `vibe chart`, `vibe tokens`.

### Make it yours (free)

- 10 theme presets, randomize, 8 custom colors, per-page themes.
- Profile: display name, bio, X handle, channel header.

### Trust and safety (free, a feature in itself)

- Local-first: nothing is uploaded by default.
- Secret redaction on every string bound for a public surface.
- Remote callers only reach read-only public routes; every write stays on localhost.
- Keys live in a chmod 600 file, never in environment variables or public state.
- Dollar spend is hidden on every public surface by default; token counts stay public.
- Preview the exact JSON snapshot before you publish it.
- MCP server so Claude can read your stats and change your theme.

### Publish (self-host free, hosted planned)

- Self-host: publish a sanitized snapshot to your own Cloudflare Worker (free, documented, available first).
- Hosted by us (planned, paid): always-on page at a handle, custom domain, full history, nothing to deploy.

## Public dollar spend

> **Decided 2026-11-01: hide dollar spend publicly by default; owner may change this back; flip `publicShowCost` to restore.**

- What is hidden: the session's dollar figure (`stats.costUsd`) on public `/state.json`, `/live`, the `/share` cards, the embed widget and the snapshot published to the Worker.
  It is omitted from the JSON entirely, not zeroed, so the number never leaves the machine.
- What stays visible: token counts everywhere, and dollar spend on the private local dashboard and the local OBS HUD.
- How to restore it: set `"publicShowCost": true` in `~/.vibelog/settings.json`, tick "Show dollar spend publicly" in the dashboard settings, or run `vibe privacy cost show` (`vibe privacy cost hide` reverts).
- How it works: `toPublicState()` in `src/state.ts` projects the live state for every public surface.
  The HUD asks for `/state.json?hud=1` and only gets the full state from a loopback caller, so a tunnel or LAN viewer cannot unlock spend with the flag.
  If OBS reaches the agent over the LAN instead of loopback, the HUD shows "lines added" in place of spend.
- Note: the HUD is still broadcast on stream, so viewers of a stream see spend there; the decision covers the always-reachable public surfaces.
- Why: dollar spend is the most sensitive number for many developers and their employers, and it invites "you spent how much?" comments that distract from the work.

## Two paths: self-host free, or hosted by us

Same model as Relink: self-hosting is offered from the start, free and open source, and "we host it for you" is a paid plan.
The landing page shows the two paths side by side, with self-host available first.

| | Self-host (free, available first) | Hosted by us (paid, planned) |
|---|---|---|
| Local agent, HUD, dashboard, recaps | Yes | Yes |
| Themes and profile | Yes | Yes, plus premium theme packs |
| `/live`, `/share`, embed on your machine or tunnel | Yes | Yes |
| Always-on public page | On your own Cloudflare Worker (free tier) | At a VibeLog handle on `vibelogs.dev`, nothing to deploy |
| Custom domain with SSL | Yes, on your own Cloudflare account | Yes |
| History on the public page | What your Worker keeps | Full history |
| Publish cadence | Your choice (default 5 min live, 15 min idle) | About 30-60 s while live |
| Hosted share-card images and OG unfurls | Self-render | Yes |
| "powered by VibeLog" badge | Shown by default, removable | Removable |
| Account needed | No | Yes (GitHub sign-in) |

### Is a free hosted tier still worth it?

Recommendation: **no free hosted tier at launch.**
Reasoning:

- The original reason for a hosted free tier was the badge loop for people who will not self-host.
  Self-hosted pages carry the same "powered by VibeLog" badge by default, so the loop still exists without us paying to host free pages.
- Every free hosted page costs KV writes, Worker CPU for card renders, abuse handling and support, and needs the full multi-tenant stack before it earns anything.
- A clean split ("free if you run it, paid if we run it") is easier to explain on the landing page and matches the Relink model.
- People who want to try hosted before paying get a **14-day free trial** of the paid plan instead.

Revisit if the waitlist shows many sign-ups who want a public page but will neither deploy a Worker nor pay; a limited hosted free tier (badge, 30-day history, slow cadence) is the fallback design.

## Pricing (planned, reasoned)

All prices are **planned** and may change before launch.

- **Self-host: free**, the whole local product plus self-hosting the public page, forever, open source (license still undecided).
- **Hosted by us: $6/month or $60/year (planned)**, with a 14-day free trial.
- **Theme packs:** optional one-time purchases later, if the hosted plan alone does not carry the cost.
- **Teams:** not priced; revisit only on real demand.

Why $6:

- Below WakaTime Basic ($9/mo) and Premium ($14/mo), which sell personal analytics with history.
- Below OWN3D Pro (EUR 7-11/mo) and well below Streamlabs Ultra ($27/mo), which sell overlay polish.
- Every AI-spend and recap tool is free, so the paid plan must sell hosting, domain, history and no badge, not the numbers.
- Hosting cost per hosted user on Cloudflare is cents per month, so $6 is mostly margin for support and development.
- A round, impulse-level price suits an audience that already pays for Claude, Cursor or similar every month.

## Comparison

| | VibeLog | WakaTime | Streamlabs / StreamElements / OWN3D | ccusage + leaderboards | devcard / Claude Wrapped |
|---|---|---|---|---|---|
| Live OBS overlay | Yes | No | Yes | No | No |
| Git activity | Yes | Commits on Premium | No | No | devcard (git mode) |
| AI token spend | Yes (Claude now) | Premium | No | Yes | Some |
| Stream time and channel growth | Yes | No | Partial (alerts, goals) | No | No |
| Public live page | Yes | Profile, not live | No | Leaderboard profiles | No |
| Share cards | Yes, server-rendered | Charts | No | Some | Yes |
| Runs fully local | Yes | No (hosted) | No (hosted) | Yes (CLI) | Yes |
| Open source | Planned (license undecided) | Plugins only | No | Yes | Yes |
| Price | Self-host free; hosted $6/mo planned | Free to $24/dev/mo | Free to $27/mo | Free | Free |

## Name check

- "VibeLog" has no clash inside the developer or streaming category.
- Clashes outside the category: an iOS industrial vibration-monitoring app called VibeLog, an unrelated npm package named `vibelog`, a dormant GitHub organization `vibelog`, and `vibelog.com`, `.dev`, `.app` and `.io` all resolve as registered.
- "Vibe coding" may date as a term; the name still reads fine as "a log of your vibe" if the term fades.

Recommendation: **keep VibeLog.**

- **Canonical URL: `https://vibelogs.dev`** (note the s).
  Decided 2026-11-01: the owner already owns `vibelogs.dev`; it is the canonical URL for the landing page and the docs.
  The earlier `vibelog.n8builds.dev` recommendation is dropped.
- Optional extra domain: `vibelog.live` looked available on 2026-11-01 via RDAP (no registration record; unconfirmed, not purchased).
  It is an option only, for example as a redirect; nothing depends on it.
- npm package: `vibelog-cli` (appears free) or a scoped `@n8builds/vibelog`; the command stays `vibe`.

Alternatives if the owner wants a clean, ownable name:

| Name | Signal | Domain check (DNS only, unverified) |
|---|---|---|
| VibeHUD | Says "overlay" clearly | `vibehud.dev` no DNS; `vibehud.com` taken; npm taken |
| BuildFeed | Category-neutral, survives the "vibe" fad | `buildfeed.dev` no DNS |
| DevHUD | Generic | `devhud.live` no DNS |

## Owner decisions (2026-11-01)

1. **Model:** self-host free and open source from the start; "hosted by us" is a paid plan, planned.
   No free hosted tier at launch (reasoning above); pricing stays marked "planned".
2. **Domain:** `https://vibelogs.dev` is canonical; `vibelog.live` is noted as an unpurchased option.
3. **Waitlist:** every early-access CTA links to `https://n8builds.dev/upcoming?interest=vibelog#vibelog`.
4. **Public dollar spend:** hidden by default.
   Decided 2026-11-01: hide dollar spend publicly by default; owner may change this back; flip `publicShowCost` to restore.

## Open questions

- **License:** not decided (MIT and Apache-2.0 are the candidates).
- **Making the repository public:** not decided.
