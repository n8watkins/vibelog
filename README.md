# VibeLog

Live coding telemetry + an OBS overlay for vibe-coding streams. One local Node
process tracks your git activity, Claude token spend, stream time and channel
growth, and serves a live HUD (OBS Browser Source), a private dashboard, a public
**/live** page, and shareable **/share** cards. **Local-first, no accounts, $0.**

The marketing site is live at https://vibelogs.dev (source in `landing/`, deploy steps in
[`landing/DEPLOY.md`](./landing/DEPLOY.md)).

Roadmap & direction live in [`docs/VISION.md`](./docs/VISION.md) (canonical) and
[`docs/HANDOFF.md`](./docs/HANDOFF.md) (architecture cold-start). The root
`V0_SPEC.md`, `PRD.md`, and `NEXT_STEPS.md` are **historical** — superseded by
`docs/VISION.md`.

What only the owner can do (tests that need real accounts and OBS) is in [`OWNER-TODO.md`](./OWNER-TODO.md).

## Quick start

```bash
npm install

# Optional: set a default project name
npm run vibe -- init --project "VibeLog"

# Start a session + the overlay agent (runs in the foreground — leave it up)
npm run vibe -- start --cwd /path/to/the/repo/youre/streaming --title "Building the live tracker"

# …or just preview everything with seeded fake data (no git/session needed):
npm run vibe -- demo
```

Then in **OBS** add a **Browser Source** pointing at:

```
http://localhost:4545/overlay
```

(Width 1920, Height 1080, transparent background — the HUD sits along the bottom.)

From **another terminal**, drive the overlay while you code:

```bash
npm run vibe -- building "wiring the live stats card" --mode coding
npm run vibe -- mark feature "live LOC counter works"
npm run vibe -- mark bug "fixed double-count on stash"
npm run vibe -- status        # dump current live state
npm run vibe -- end           # end session, stop the agent
```

When you wrap up, get a recap built from your local log (no AI, no network):

```bash
npm run vibe -- report             # today
npm run vibe -- report yesterday
npm run vibe -- report 2026-06-01
```

```
📊 Vibe report — 2026-06-06

  ⏱  3h 12m active  ·  2 sessions
  ✨ 5 features  ·  🐛 2 fixes  ·  💬 41 prompts  ·  🔧 318 tool calls

  Code — VibeLog
    +842 / -219 lines  ·  13 files  ·  4 commits  ·  1.2M tokens

  Shipped
    ✨ live LOC counter works
  ...
```

Get a weekly rollup, or a GitHub-style activity heatmap with a Vibe Score:

```bash
npm run vibe -- report week        # 7-day recap with per-day bars
npm run vibe -- chart              # activity heatmap (last 84 days)
npm run vibe -- chart --days 365   # a full year
```

```
📈 Vibe chart

  Mon ■ ■ ■ ■ ▦ ▩ ▩ ■
      ...
  🔥 6-day streak  ·  longest 11  ·  31/56 active days
  ✨ 19 shipped  ·  🐛 13 fixed  ·  ⏱ 26h coded  ·  ⚡ vibe score 462
```

Or open the **private dashboard** in your browser while the agent is running —
today's stats + recap, this week's bars, and the activity heatmap, all in one
page (localhost only — remote/tunneled requests are refused, see *Safety*):

```
http://localhost:4545/dashboard
```

Build modes: `planning designing coding debugging polishing deploying shipping`.

### Make `vibe` a real command (recommended)

So `vibe` targets whatever repo you're in (instead of `npm run vibe --` from this dir):

```bash
alias vibe="npx tsx $(pwd)/src/cli.ts"
# then, from any project:  vibe start
```

## Auto-track with Claude Code hooks (optional)

Wire VibeLog into Claude Code so the overlay updates itself while you code — your
prompt becomes the "Now Building" card and git stats refresh right after each edit.

```bash
npm run vibe -- hooks print              # preview the settings.json block
npm run vibe -- hooks install --global   # ~/.claude/settings.json (all projects)
npm run vibe -- hooks install --dir .    # ./.claude/settings.json (this project only)
```

Restart Claude Code afterwards. The hook script is fire-and-forget: it never blocks
Claude, writes nothing to its stdout, and silently does nothing when no `vibe`
session is running. Prompt text is redacted before it can reach the overlay.

## What it tracks

- **Git**, polled every 5s: lines added/removed, files changed (incl. untracked),
  commits since session start, current branch.
- **Claude tokens for this session**, polled every 30s via `npx ccusage --json`
  (today's total minus the total captured at `vibe start`).
- **Milestones** you mark: features, bugs, etc. → the build log.
- **Now Building**: whatever you type via `vibe building`, or — when Claude Code hooks
  are wired — your prompt, turned into a short feature label by the summarizer
  (Gemini Flash-Lite via `src/summarize.ts`, with a pure-local template fallback when
  no key is set). The raw prompt is never persisted; only the redacted label is.
- **Stream time** from the OBS WebSocket, and **Twitch/YouTube** live status +
  follower/sub counts (channel-growth deltas over time) when configured.

## Tokens by project

See where your Claude tokens actually go — across *all* your work, not just
VibeLog sessions. Parses local Claude Code transcripts (no network, no ccusage):

```bash
npm run vibe -- tokens --days 7        # last 7 days
npm run vibe -- tokens --since 2026-06-01 --top 20
```

```
la-pool-engine            301.6M   19%  ████████████████████████
date-planner-mini-site    237.2M   15%  ███████████████████
website-template          219.5M   14%  █████████████████
...
```

## Safety

Every user-typed string written to the overlay passes through a redactor
(`src/redact.ts`) that scrubs API keys, tokens, private keys, and `key=value`
secrets before they can hit the public-facing state. The overlay only ever emits
text you typed + numeric stats — no paths, diffs, or prompts. Raw history is kept
private in `~/.vibelog/events.jsonl`.

The agent binds `0.0.0.0` (so Windows OBS can reach a WSL session), and `vibe
share` tunnels the whole port — so it **gates by origin**. Direct/localhost
requests get everything; remote or tunneled requests (detected via cloudflared's
forwarding headers, `isRemote()` in `src/agent.ts`) get the read-only public
routes only (`/`, `/overlay`, `/live`, `/landing`, `/share`, `/share/card.png`,
`/state.json`, `/api/theme.json`, `/api/presets.json`, `/api/profile.json`,
`/shots/*.png`). The write endpoints (`mark`/`building`/`end`/settings/OAuth/hooks)
and the private `/dashboard` return `403` for them — a viewer can't end your
session, inject overlay text, change your theme, or read your dashboard.

**Web pages in your own browser are kept out too** (`src/guard.ts`). A page you
visit while live connects from localhost, so the agent also checks what the
browser says about it:

- Every write must be `Content-Type: application/json`, and when the browser
  sends `Origin` or `Sec-Fetch-Site` they must name the agent's own origin. The
  CLI, the Claude Code hook and the MCP server already send JSON with no Origin.
- CORS headers go only on the public read-only routes above, so another site
  can't read `/api/dashboard.json` or `/api/settings.json`.
- The `Host` header must be `localhost`, `*.localhost`, `127.0.0.1`, `[::1]`,
  an IP address (for example your LAN IP from Windows OBS), or a name you list
  in `~/.vibelog/config.json` as `"allowedHosts": ["studio-pc.lan"]`. Any other
  name (DNS rebinding) is treated like a remote viewer: public routes only.

**Dollar spend is private by default.** Public surfaces (`/state.json`, `/live`,
the embed widget and any snapshot you publish) carry token counts but not the
session's dollar cost. The private dashboard and your local OBS HUD still show
it. To show spend publicly, tick "Show dollar spend publicly" in the dashboard
settings or run `npm run vibe -- privacy cost show` (`hide` reverts; it sets
`publicShowCost` in `~/.vibelog/settings.json`).

`vibe demo` keeps its fake session in memory and never writes your real
`~/.vibelog/state.json`, `session.json` or `events.jsonl`.

**Credentials** (Gemini key, OBS password, Twitch/YouTube/Discord/GitHub app
creds, OAuth tokens) live only in `~/.vibelog/` (chmod 600) — VibeLog reads **no
environment variables**. Copy [`secrets.example.json`](./secrets.example.json) to
`~/.vibelog/secrets.json` and fill in only what you use; with none set, VibeLog
runs in zero-config local mode. Keys never reach `LiveState`/the overlay; see
[`CLAUDE.md`](./CLAUDE.md) and [`docs/INFRA_PLAN.md`](./docs/INFRA_PLAN.md) §1/§4.

```bash
npm test        # redactor tests
npm run typecheck
```

## Going public (still free)

The agent serves a polished, shareable public page at **`/live`** — a richer,
full-screen view of the same state (great to link in your bio or pin in chat).
It shows an "Offline — back soon" state when no session is running, so the URL is
safe to share permanently. There's also a **`/share`** page with proper OG/Twitter
meta and a server-rendered card image (`/share/card.png?kind=stats|join`) so links
unfurl nicely, plus a marketing **`/landing`** page. To track Twitch follower
counts, authorize once with `npm run vibe -- twitch login`.

To expose it to viewers over the internet, run a free Cloudflare Tunnel:

```bash
npm run vibe -- share            # wraps `cloudflared tunnel --url http://localhost:4545`
# → viewers visit <the trycloudflare URL>/live
```

(`vibe share` prints install instructions if `cloudflared` isn't present.)

## Files

```
hooks/
  claude-hook.mjs    dumb Claude Code hook → forwards to the agent (no deps)
src/
  cli.ts             vibe CLI (commander): start/demo/building/mark/report/chart/
                       tokens/share/twitch login/hooks/status/end
  agent.ts           HTTP server + in-memory LiveState + pollers + all routes
                       (+ isRemote/originOf origin gate)  (+ agent.test.ts)
  config.ts          paths + defaults (ports, ~/.vibelog file locations)
  secrets.ts         ~/.vibelog/secrets.json reader (chmod 600, never logged)
  store.ts           ~/.vibelog persistence (session/state/events/settings/config)
  state.ts           LiveState contract (the public-safe overlay schema)
  redact.ts          secret scrubber for overlay-bound text  (+ redact.test.ts)
  git.ts             git metrics (lines/files/commits/branch)
  ccusage.ts         Claude token + cost totals via ccusage  (+ ccusage.test.ts)
  claude-projects.ts tokens-by-project from local transcripts  (+ test)
  projects.ts        per-project activity (transcripts × git)  (+ projects.test.ts)
  report.ts          `vibe report` daily/weekly recaps  (+ report.test.ts)
  chart.ts           `vibe chart` heatmap + Vibe Score  (+ chart.test.ts)
  summarize.ts       prompt → feature label (Gemini Flash-Lite + fallback)  (+ test)
  obs.ts             OBS WebSocket bridge (live started/ended)
  stream.ts          per-day stream minutes from events  (+ stream.test.ts)
  social.ts          Twitch/YouTube live + follower/sub stats  (+ social.test.ts)
  twitch-oauth.ts    `vibe twitch login` user OAuth + refresh  (+ test)
  oauth.ts           generic integrations OAuth engine (S3)  (+ oauth.test.ts)
  theme.ts           theme model + allowlist + presets + sanitizeProfile  (+ test)
  share.ts           /share OG/Twitter card SVG → PNG (resvg)  (+ share.test.ts)
  demodata.ts        seeded demo year for `vibe demo`
public/
  overlay.html       the OBS HUD (transparent, self-contained)
  live.html          public /live page (full-screen viewer view)
  share.html         /share page (OG/Twitter cards, copy-link)
  landing.html       /landing marketing page
  dashboard.html     private /dashboard (today + week + heatmap, localhost only)
  shots/             product screenshots served to the landing/OG image
docs/
  HANDOFF.md  VISION.md  THEMING.md  INFRA_PLAN.md   (architecture + roadmap)
```

## Commits and releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat: ...`, `fix: ...`, `docs: ...`), and releases are cut with [release-kit](https://github.com/n8watkins/release-kit); see [`RELEASING.md`](RELEASING.md).
Installing turns on a `commit-msg` hook that checks each message, and CI checks pushed commits and pull request titles.
The repo uses npm throughout (the agent, `worker/` and `landing/` each have their own `package-lock.json`), which is also what the release tooling installs with.

Releasing is optional and only for this repository: a fork never has to tag, release or set up anything.
The Release workflow runs only in `n8watkins/vibelog`, so pushing a tag in a fork publishes nothing.
The hook only checks message format; `git commit --no-verify` skips it.

VibeLog reads no environment variables, so there is no `.env.example`: credentials go in `~/.vibelog/secrets.json` (see [Safety](#safety)).

## License

MIT, see [LICENSE](./LICENSE).
