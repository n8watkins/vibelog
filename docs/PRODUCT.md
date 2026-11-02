# VibeLog - product definition

Status: proposal, 2026-11-01.
Inputs: `docs/ASSESSMENT_2026-11.md`, `docs/MARKET_REPORT_2026-11.md`, `docs/VISION.md`.

## Positioning

**One-liner:** VibeLog shows what you are building with AI, live, with real git and token numbers, on your stream and on a public page, and nothing leaves your machine unless you publish it.

**Tagline:** Proof of work, live.

**Short pitch:**
VibeLog is a free, open-source agent that runs next to your editor.
It watches your git activity, AI token spend, stream time and channel growth, and turns them into an OBS overlay, a public live page and share cards.
Run it all yourself, or (later) let us host your public page so it stays up when your laptop is off.

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
- Preview the exact JSON snapshot before you publish it.
- MCP server so Claude can read your stats and change your theme.

### Publish (self-host free, hosted planned)

- Publish a sanitized snapshot to your own Cloudflare Worker (free, documented).
- Or publish to VibeLog Cloud (planned): always-on page at a handle, custom domain, full history.

## Free vs paid

| | Free, open source | Pro (planned) |
|---|---|---|
| Local agent, HUD, dashboard, recaps | Yes | Yes |
| Themes and profile | Yes | Yes, plus premium theme packs |
| `/live`, `/share`, embed on your machine or tunnel | Yes | Yes |
| Self-host the public page on your own Cloudflare account | Yes | Not needed |
| Hosted always-on public page (`vibelog.n8builds.dev/@you`) | No | Yes |
| Custom domain with SSL | Self-host only | Yes |
| "powered by VibeLog" badge | Shown on hosted free pages | Removable |
| History on the public page | Last 30 days on hosted free | Full history |
| Publish cadence | 5 min while live, 15 min idle | About 30-60 s while live |
| Hosted share-card images and OG unfurls | Self-host only | Yes |

A **hosted free tier** (handle page with badge, 30-day history, slow cadence) is part of the plan so that the viral badge loop works for people who will not self-host.

## Pricing (planned, reasoned)

- **Free:** the whole local product plus self-hosting, forever, under an OSI license.
- **Hosted Free:** handle page with badge, 30-day public history, slow cadence.
- **Pro: $6/month or $60/year.**
- **Theme packs:** optional one-time purchases later, if Pro alone does not carry the cost.
- **Teams:** not priced; revisit only on real demand.

Why $6:

- Below WakaTime Basic ($9/mo) and Premium ($14/mo), which sell personal analytics with history.
- Below OWN3D Pro (EUR 7-11/mo) and well below Streamlabs Ultra ($27/mo), which sell overlay polish.
- Every AI-spend and recap tool is free, so the paid tier must sell hosting, domain, history and no badge, not the numbers.
- Hosting cost per Pro user on Cloudflare is cents per month, so $6 is mostly margin for support and development.
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
| Open source | Planned (this plan) | Plugins only | No | Yes | Yes |
| Price | Free; Pro $6/mo planned | Free to $24/dev/mo | Free to $27/mo | Free | Free |

## Name check

- "VibeLog" has no clash inside the developer or streaming category.
- Clashes outside the category: an iOS industrial vibration-monitoring app called VibeLog, an unrelated npm package named `vibelog`, a dormant GitHub organization `vibelog`, and `vibelog.com`, `.dev`, `.app` and `.io` all resolve as registered.
- "Vibe coding" may date as a term; the name still reads fine as "a log of your vibe" if the term fades.

Recommendation: **keep VibeLog** and host under the owner's brand.

- Public product URL: `vibelog.n8builds.dev` (already planned in `VISION.md`).
- npm package: `vibelog-cli` (appears free) or a scoped `@n8builds/vibelog`; the command stays `vibe`.
- Optional vanity domain: `vibelog.live` or `vibelog.sh` (no DNS records found on 2026-11-01; availability unverified, check with a registrar).

Alternatives if the owner wants a clean, ownable name:

| Name | Signal | Domain check (DNS only, unverified) |
|---|---|---|
| VibeHUD | Says "overlay" clearly | `vibehud.dev` no DNS; `vibehud.com` taken; npm taken |
| BuildFeed | Category-neutral, survives the "vibe" fad | `buildfeed.dev` no DNS |
| DevHUD | Generic | `devhud.live` no DNS |
