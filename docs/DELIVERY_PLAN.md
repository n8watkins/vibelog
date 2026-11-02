# VibeLog - delivery plan

Status: proposal, 2026-11-01.
Strategy: **open source and self-host first, hosted later**, the same path as Rewire.
This plan builds on `docs/VISION.md` section 6 and `docs/PLATFORM_PLAN.md`; where they disagree on sequencing, this plan proposes the change and the owner decides.

## 1. Architecture

```
YOUR MACHINE (always)                        RELAY (self-host or VibeLog Cloud)            VIEWER
+-------------------------------+   HTTPS    +--------------------------------+   GET     +---------+
| vibe agent (Node, tsx/bundled) | --------> | Cloudflare Worker              | <-------- | browser |
|  git / AI tokens / OBS / social|  signed   |  POST /v1/snapshot (auth)      |           | no login|
|  summarize -> redact -> cap    |  snapshot |  GET  /@handle, /@handle/share |           +---------+
|  LiveState -> HUD, dashboard   |           |  GET  /@handle/card.png        |
|  buildShareData() -> snapshot  |           |  D1: handles, tokens, rollups  |
+-------------------------------+           |  KV: latest snapshot (cache)   |
  secrets stay here                          |  R2: rendered card PNGs        |
  OBS reads localhost only                   +--------------------------------+
```

### 1.1 Local agent (open source)

- Unchanged core: one Node process, static pages, three runtime dependencies.
- Distributed as an npm package (`vibelog-cli`, bin `vibe`), bundled to plain JS so users do not need `tsx`.
- New token-source interface: `claude` (local transcripts), `codex`, `gemini-cli`, each a pure parser over local logs.
- Publisher stays outbound only; it adds no inbound route.

### 1.2 Relay (open source, self-hostable, later also hosted)

- One Cloudflare Worker codebase serves both modes: single-tenant self-host (today's Worker) and multi-tenant hosted.
- **D1** for handles, hashed publish tokens, plan flags and daily rollups (history).
- **KV** for the latest snapshot per handle (fast reads, eventually consistent is fine).
  Writes are throttled to on-change plus cadence; on the free Cloudflare plan KV allows 1,000 writes/day, so the hosted relay runs on Workers Paid, and self-hosters with one user stay well inside free limits.
- **R2** for cached share-card PNGs keyed by snapshot hash (render once, serve many).
- Card rendering moves to the relay with `resvg-wasm`, or the agent uploads the PNG with the snapshot; decide in milestone 3 by measuring Worker CPU.
- Custom domains via Cloudflare for SaaS custom hostnames (Pro).

### 1.3 Auth

- **Viewers:** none, ever.
- **Self-host:** one random publish token set as a Wrangler secret (today's model).
- **Hosted owner auth:** sign in with GitHub on the web, claim a handle.
- **Agent pairing:** device-code flow. `vibe publish login` shows a short code, the owner approves it in the browser, the relay issues a per-device token; only its hash is stored. Tokens are revocable per device.
- **Billing:** Stripe Checkout + webhook flips a plan flag in D1.

### 1.4 Privacy of token and cost data

- Default: nothing leaves the machine.
- Publishing is opt-in per field group: `activity` (commits, lines), `ai` (tokens), `cost` (dollars), `stream`, `social`, `now_building`.
  **Cost is off by default** because dollar spend is the most sensitive number for many developers and employers.
- Snapshot preview screen shows the literal JSON before the first publish and after any field change.
- Snapshots contain only `buildShareData` output: four profile fields, numbers, theme variables and a redacted, capped label. Never prompts, paths, diffs, repo names unless the user typed them as project names, or keys.
- Hosted relay stores the latest snapshot plus daily numeric rollups; deleting the account deletes both.
- Publish tokens are hashed at rest; the relay never sees provider OAuth tokens.

## 2. Milestones

Effort is for one developer working with coding agents, in focused days.

### M0 - Open-source ready (first milestone, about 4-6 days)

- Add MIT license (or Apache-2.0 if patent language matters), `CONTRIBUTING.md`, `SECURITY.md`, code of conduct.
- CI on GitHub Actions: test, typecheck and audit for root and `worker/`.
- Lint (ESLint flat config or Biome) and fix findings.
- Make `worker/` a pnpm workspace package; generate `worker/public` pages from `public/` instead of copying.
- Fix demo mode so it never writes `~/.vibelog/state.json`.
- Replace `npx --yes ccusage` with the local transcript parser (or a pinned dependency).
- Rewrite the README for strangers: install, OBS, hooks, privacy.
- Final history secret scan (2026-11-01 scan was clean), then flip the repo public.
- Ship the landing page (`landing/`) and the n8builds.dev upcoming-page section.

### M1 - Installable and multi-agent (about 5-8 days)

- Bundle and publish `vibelog-cli` to npm with provenance.
- `vibe init` wizard: pick repos, OBS check, optional Twitch/YouTube, optional publish.
- Token sources for Codex and Gemini CLI.
- macOS and Linux OBS docs; Windows + WSL stays first class.
- Docs site from `docs/DOCS_OUTLINE.md`.

### M2 - Self-host the public page (about 4-6 days)

- User-facing self-host guide: deploy the Worker to your own Cloudflare account in 10 minutes.
- Snapshot preview screen and per-field publish consent.
- Attach `vibelog.n8builds.dev` to the owner's Worker and keep it publishing (dogfood).
- Daily rollups so `/live` offline mode shows history from the relay.

### M3 - VibeLog Cloud beta (about 10-15 days, only if kill criteria pass)

- Multi-tenant relay: handles, D1 schema, per-device tokens, rate limits, abuse controls.
- GitHub sign-in, handle claim, device-code pairing.
- Hosted free tier with badge and 30-day history.
- Card rendering and R2 caching.
- Invite-only beta from the waitlist.

### M4 - Pro (about 6-10 days)

- Stripe billing, plan flags, fast cadence, badge removal, full history.
- Custom domains via Cloudflare for SaaS.
- Premium theme pack format (optional).

### Later

- Kick and X live status, Discord notifications, auto-post daily card to X, team boards.

## 3. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Streaming niche too small to sustain a paid tier | High | Lead with build-in-public pages and embeds; streaming is the demo |
| Claude Code or ccusage log formats change | Medium | Own parsers with fixtures per version; contract tests |
| Anthropic, GitHub or WakaTime ship a native live/share page | Medium | Open source, multi-agent, streamer-specific HUD as the moat |
| Privacy backlash over publishing AI spend | Medium | Cost off by default, preview screen, local-first default |
| Twitch/YouTube OAuth app friction for users | High | Optional integrations; document clearly; consider a brokered app in hosted mode |
| Owner time split across many products | High | M0-M2 are small; M3+ gated by kill criteria |
| Free-tier Cloudflare KV write limits | Low | Workers Paid for hosted; D1 for rollups |
| Secrets leaking on stream | Low, severe | Existing redactor and no-env design; keep the streaming-safety rules in contributor docs |

## 4. Kill criteria

Evaluate 8 weeks after M0 ships publicly.
Park the hosted tier (keep the open-source tool) if any two are true:

- Fewer than 150 GitHub stars.
- Fewer than 100 waitlist sign-ups with `interest=vibelog`.
- Fewer than 10 people other than the owner running the agent weekly (opt-in ping or self-reported).
- No unsolicited requests for hosting, a custom domain or history.

Stop work on VibeLog entirely if, after M1, fewer than 3 external users keep it running for 2+ weeks.

## 5. Success metrics

| Stage | Metric | Target |
|---|---|---|
| M0 | Repo public, CI green, landing live | Done |
| M0 + 8 weeks | GitHub stars | 150+ |
| M0 + 8 weeks | Waitlist sign-ups | 100+ |
| M1 | npm weekly downloads | 100+ |
| M2 | Self-hosted public pages seen in the wild (badge referrals) | 10+ |
| M3 beta | Weekly active publishers | 50+ |
| M4 | Paying Pro users | 25+ within 3 months (covers hosting many times over) |
| Ongoing | Owner streams with the HUD | Every stream |

## 6. Owner decisions needed

1. License: MIT (recommended) or Apache-2.0.
2. Make the repository public after M0.
3. Keep the name VibeLog (recommended) and publish as `vibelog-cli`.
4. Whether to buy `vibelog.live` as a vanity domain.
5. Cost field off by default on public surfaces (recommended).
