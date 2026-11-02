# VibeLog market report - November 2026

Researched 2026-11-01.
Prices are list prices found on the date above.
Anything marked **(unverified)** came from a third-party aggregator, a competitor's own claims, or a page that conflicted with another source.
Sources are listed at the end and referenced as [S#].

## 1. The job VibeLog does

VibeLog turns an AI-assisted coding session into something an audience can watch and share.
It collects git activity, Claude token spend, stream time and channel growth on the developer's machine, then shows it as an OBS HUD, a public `/live` page and share cards.
No single competitor does that combination.
The market splits into five adjacent categories, each of which owns one slice.

## 2. Competitors and adjacent tools

### 2.1 Stream overlays and widgets

| Product | Model | Price | Dev/coding data? |
|---|---|---|---|
| Streamlabs | Free core + Ultra subscription | Ultra $27/mo or $189/yr [S1][S2] | None; alerts, goals, chat, themes |
| StreamElements | Free tools, revenue from sponsorship deals and merch [S3][S4] | Free; a paid tier from about $10/mo is reported **(unverified)** [S5] | None |
| OWN3D Pro | Overlay/alert subscription | EUR 10.99/mo monthly, EUR 7.08/mo annual [S6] | None |
| Hobby OBS dev overlays (twitch-git-diff-monitor and similar) | Open source | Free | Git diff only, mostly unmaintained since 2020 [S7] |

Takeaway: overlay platforms are mature, cheap or free, and built for gamers.
None of them knows what a commit, a token or a build is.
Streamers already accept paying roughly $7-27/mo for overlay polish.
StreamElements shows the risk of "free tools funded by sponsorships": reporting from a competitor claims late creator payouts and acquisition talks in 2026 **(unverified)** [S8].

### 2.2 Coding-time trackers

| Product | Model | Price | Notes |
|---|---|---|---|
| WakaTime | Hosted SaaS, open-source editor plugins | Free (1 week history); Basic $9/mo; Premium $14/mo; Team $21/dev/mo; Business $24/dev/mo [S9] | Premium now sells "AI adoption, model usage and spend" and "AI vs human code" insights [S9] |
| Hackatime (Hack Club) | Open source, WakaTime-compatible, self-hostable | Free [S10] | Proves an open-source WakaTime clone can win a community |
| Codetime-style self-hosted backends | Open source | Free [S11] | Small |

Takeaway: WakaTime is the closest business comp and has moved into AI spend tracking.
It is editor-telemetry first, team-analytics second, and has no streaming or overlay story.

### 2.3 Claude and AI token-spend trackers

| Product | Model | Notes |
|---|---|---|
| ccusage | Open source CLI, MIT | About 11.3k GitHub stars (March 2026 snapshot) [S12]; reads Claude Code and Codex local JSONL. VibeLog already depends on it |
| Claude Code Usage Monitor, usage bars, statuslines | Open source | Real-time burn rate in the terminal [S13] |
| Clawdboard, Claude Rank, ccclub, clog.sh | Free hosted leaderboards + profiles | Spend, tokens, streaks, heatmaps, badges; some read multiple agents [S14][S15] |

Takeaway: "how much did I spend" is a commodity and is free.
Public leaderboards exist, which proves people want to show their AI usage, but they compete on rank, not on showing the work.

### 2.4 AI session recap and share tools

| Product | Model | Notes |
|---|---|---|
| devcard | Open source (MIT), local render, publishes an SVG card to your GitHub repo | Claude-hook or git capture, explicit per-category consent; 0 stars at capture [S16] |
| Claude Code Wrapped (cc-wrapped) | Open source CLI | Shareable PNG "wrapped" card, local only [S17] |
| Claude Recap | Open source | "Spotify Wrapped for Claude Code", HTML export [S17] |
| Claudebin | Open source | Share whole sessions as resumable URLs [S17] |

Takeaway: the shareable-card idea is being built by many solo developers right now, all free and open source.
None of them is live, none targets streamers, and none combines git + tokens + stream + channel growth.
devcard's privacy design (local render, explicit consent per field) is the bar VibeLog's trust story must meet.

### 2.5 Build-in-public pages and contribution visualizers

| Product | Notes |
|---|---|
| GitHub profile contribution graph + README stat cards | The default "public dev stats" surface; free |
| Polywork-style professional timelines | Polywork itself shut down in early 2025 **(unverified)**; the category has no strong incumbent |
| X build-in-public threads + screenshot tools | Manual, high effort; sentiment that build in public is oversaturated on X is rising [S18][S19] |

Takeaway: there is no live, always-on "what I am building right now" page with real numbers behind it.

## 3. Market size signals

Hard numbers are thin, so treat this as directional.

- Twitch "Software and Game Development" averaged roughly 1,350-2,000 concurrent viewers across about 125-130 concurrent channels in mid-2026 **(unverified, partially paywalled data)** [S20].
  That is a small category; most individual coding streams peak at tens of viewers [S21].
- Event-style vibe coding streams can spike much higher: Every's 8-hour Vibe Coding Marathon in September 2025 reported over 30,000 viewers **(unverified platform)** [S21].
- ccusage's star count roughly doubled from about 5k (July 2025) to about 11.3k (March 2026) [S12], a proxy for how many developers want visibility into AI spend.
- Multiple new Claude leaderboards and profile sites launched in 2026 [S14][S15], which signals demand for public AI-usage identity.
- WakaTime adding AI spend to a $14/mo tier [S9] signals that AI usage analytics is a paid feature people buy.

Read: streamers alone are a niche of hundreds of active channels, not tens of thousands.
The larger audience is AI-assisted developers who build in public on X, GitHub and personal sites and want a living proof-of-work page.
Streaming is the wedge and the most visual demo; the share page and embed are the volume product.

## 4. Willingness to pay

- Streamers pay $7-27/mo for overlay polish today (OWN3D, Streamlabs Ultra) [S1][S6].
- Developers pay $9-14/mo for personal coding analytics with history (WakaTime Basic/Premium) [S9].
- Everything in the AI-spend and recap space is free; nobody pays for "show my token count".
- What people plausibly pay for: always-on hosting when the laptop is off, a custom domain, removing branding, longer history, and premium themes.
- Team views are where WakaTime makes money ($21-24/dev) [S9], but VibeLog's "public by design" angle is a weak fit for team analytics; treat teams as a later option, not the plan.

## 5. Monetization options

| Option | Fit | Notes |
|---|---|---|
| Free open-source local agent + overlay | Core | Trust and distribution; matches Hackatime, ccusage, devcard |
| Paid hosted `/live` + share pages (Pro) | Best | Always on, custom domain, no badge, full history, fast publish cadence |
| Premium themes / overlay packs | Good add-on | Proven by OWN3D and Streamlabs; can be a one-time purchase |
| Sponsorship / affiliate (AI tools, hosting) | Opportunistic | Fits the owner's own streams; do not build the product around it |
| Team / org dashboards | Later, uncertain | Different buyer, different privacy expectations |

## 6. Costs

- Hosted relay on Cloudflare Workers is close to free at small scale: Workers Free allows 100,000 requests/day; KV free allows 100,000 reads and 1,000 writes per day [S22][S23].
  The 1,000 KV writes/day ceiling matters: one user publishing every 5 minutes uses about 288 writes/day, so the free tier covers only about 3 active publishers.
  Workers Paid ($5/mo account minimum, verify on [S22]) or moving snapshots to D1 (100,000 rows written/day free **(unverified)** [S24]) or Durable Objects removes that ceiling.
- R2 for share-card PNG caching is free up to 10 GB with no egress fees **(unverified)** [S23].
- Gemini Flash-Lite summarization is BYO key; local LLM and template modes cost nothing.
- Main real cost is the owner's time on support, OAuth app reviews (Twitch/YouTube), and keeping up with Claude Code and ccusage format changes.

## 7. Distribution

1. The owner's own vibe coding streams: the HUD is on screen every stream, which is a live demo with every broadcast.
2. The "powered by VibeLog" badge on `/live`, embeds and share cards (the Calendly/Linktree loop).
3. n8builds.dev: an upcoming-products page with a VibeLog section and waitlist (`/upcoming?interest=vibelog#vibelog`).
4. X: daily share cards from the owner's sessions; each card is an ad.
5. Open-source discovery: GitHub, Hacker News "Show HN", r/ClaudeAI, the ccusage and Claude Code communities, awesome-claude-code lists.
6. Partnerships with other coding streamers: give them a themed setup for free in exchange for visibility.

## 8. Verdict: build (narrowly), open-source first

**Build**, but as an open-source, self-hostable tool first, and only add hosting once there is pull.

Reasoning:

- The product already exists and works; the remaining work is packaging, not invention.
- The full combination (live HUD + git + AI spend + stream + channel growth + public page + share cards) has no direct competitor.
  Overlay platforms lack dev data, trackers lack a live audience surface, and recap tools are static.
- The streaming niche is small, so the hosted business must ride on the wider build-in-public developer audience via `/live`, embeds and cards, not on streamers alone.
- The space is crowded with free tools in every individual slice, so charging for the slices (token counts, cards) will not work.
  Charge only for the hard-to-self-host parts: hosting, domain, history, network.
- Kill risk is real: Anthropic or GitHub could ship native usage/share features, and WakaTime could add a public live page.
  Being open source and multi-agent is the hedge.

**Sharpest differentiator:** VibeLog is the only tool that shows what you are building *live*, with real git and AI-spend numbers, on your stream and on a public page, while keeping everything on your machine unless you choose to publish.
In one line: "proof of work, live."

## 9. Top 5 competitors to watch

1. WakaTime: closest business model, now sells AI usage insights, no live/public-stream angle.
2. ccusage (and the leaderboards built on it): owns AI spend tracking for free; VibeLog should embrace it, not fight it.
3. Streamlabs / StreamElements / OWN3D: own the overlay budget and OBS mindshare, zero developer data.
4. devcard and Claude Wrapped-style recap tools: same "shareable proof" instinct, static and free.
5. Hackatime: proof that an open-source, self-hosted dev-stats tool can build a community around a free core.

## Sources

- [S1] Streamlabs FAQ (Ultra pricing, DE): https://streamlabs.com/de-de/faq
- [S2] Toolradar, Streamlabs pricing: https://toolradar.com/tools/streamlabs/pricing
- [S3] TechCrunch, StreamElements raises $100M (2021): https://techcrunch.com/2021/09/22/streamelements-nabs-100m-as-it-passes-1-1m-creators-using-its-platform-to-build-and-monetize-video-content
- [S4] GamesBeat, StreamElements merch: https://gamesbeat.com/streamelements-merch-semerch/
- [S5] Toolradar, StreamElements calculator: https://toolradar.com/tools/streamelements/calculator
- [S6] OWN3D help center, OWN3D Pro pricing: https://help.own3d.tv/hc/en-us/articles/360019994498-How-to-use-OWN3D-Pro
- [S7] GitHub search results for OBS dev overlays (e.g. Mew-www/stream-overlay): https://www.github.com/Mew-www/stream-overlay
- [S8] StreamChatAI blog on StreamElements (competitor opinion): https://streamchatai.com/blog/streamelements-is-in-acquisition-talks-is-the-marketplace-era-over
- [S9] WakaTime pricing (fetched 2026-11-01): https://wakatime.com/pricing
- [S10] Hackatime, WakaTime alternative: https://hackatime.hackclub.com/wakatime-alternative
- [S11] mgkprod/codetime: https://github.com/mgkprod/codetime
- [S12] Star History, ryoppippi/ccusage: https://www.star-history.com/ryoppippi/ccusage ; ClaudeLog cc-usage: https://www.claudelog.com/addons/cc-usage
- [S13] Claude Code Usage Monitor: https://oosmetrics.com/repo/Maciek-roboblog/Claude-Code-Usage-Monitor
- [S14] clog.sh announcement: https://discord-questions.convex.dev/m/1468069946553532528 ; Clawdboard: https://www.producthunt.com/products/clawdboard/makers
- [S15] ccclub: https://ccclub.dev/blog/why-i-built-ccclub
- [S16] devcard: https://github.com/augbastos/devcard
- [S17] cc-wrapped: https://classic.yarnpkg.com/en/package/cc-wrapped ; Claude Recap: https://github.com/buildingopen/claude-code-stats ; Claudebin: https://www.producthunt.com/products/claudebin
- [S18] Indie Hackers, founders losing faith in building in public: https://www.indiehackers.com/post/what-s-new-founders-are-losing-faith-in-the-building-in-public-d55cc37319
- [S19] Indie Hackers, building in public losing its shine: https://www.indiehackers.com/post/building-in-public-may-be-losing-its-shine-as-indie-hackers-question-its-value-6NIWwx3XNNlJxSSLnjbJ
- [S20] Streams Charts, Software and Game Development: https://streamscharts.com/games/software-and-game-development
- [S21] Streamer Guide, vibe coding for streamers 2026: https://streamer.guide/blog/vibe-coding-for-streamers-2026 ; Every Vibe Coding Marathon recap: https://vibecoding.app/ai-events/recap/every-vibe-coding-marathon-2025 ; Streams Charts jddoesdev: https://streamscharts.com/channels/jddoesdev/streams
- [S22] Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- [S23] Cloudflare KV pricing: https://developers.cloudflare.com/kv/platform/pricing ; Cloudflare plans: https://www.cloudflare.com/plans.md
- [S24] FreeTier.co, D1 free tier: https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives
