# VibeLog assessment - November 2026

Assessed on 2026-11-01 against `master` (123 commits at start, last product change 2026-06-20).
Canonical direction is still `docs/VISION.md`; architecture is `docs/HANDOFF.md`.

## TL;DR

The local product is real, coherent and well tested.
One `tsx` process collects git, Claude token and OBS/social signals and serves four polished surfaces: the OBS HUD, a private dashboard, a public `/live` page and `/share` cards with server-rendered PNGs.
A single-tenant Cloudflare Worker + KV publisher is deployed and answering, but nothing has published to it since 2026-06-12.
What is missing is not features but packaging: no license, no installable package, no CI, Claude-only token tracking, a private repo, and no multi-tenant hosted path.

## Backup (step 0)

- Full history scanned for committed secret files (`.env*`, `secrets.json`, keys, certs) and token shapes (`sk-`, `sk-ant-`, `ghp_`, `github_pat_`, `AIza`, `GOCSPX-`, `xox?-`, `AKIA`, private-key headers, Twitch `oauth:`, RTMP stream keys, Kick-style keys) plus high-entropy strings outside lockfiles.
- Only hits were synthetic fixtures in `src/redact.test.ts` (sequential `123456...ABCDEF` patterns that test the redactor), a placeholder `TOKEN="your..."` in a runbook, and empty fields in `secrets.example.json`.
- `secrets.json` and `.env` were never committed; `.gitignore` covers both.
- The Worker's `wrangler.toml` holds KV namespace ids, which are identifiers, not credentials; `PUBLISH_TOKEN` is a Wrangler secret.
- Result: clean, and the 25 unpushed commits were pushed to `origin/master` (no force).

## Verification run

| Check | Command | Result |
|---|---|---|
| Agent unit tests | `pnpm test` | 125 pass, 0 fail (11.8 s) |
| Agent typecheck | `pnpm typecheck` | clean |
| Worker unit tests | `cd worker && npm test` | 38 pass, 0 fail |
| Worker typecheck | `npx tsc --noEmit` | clean |
| Lint | none configured | no ESLint/Biome in either package |
| Demo | `pnpm vibe demo --port 4646` (isolated `HOME`) | all routes 200: `/overlay`, `/dashboard`, `/live`, `/share`, `/share/card.png`, `/landing`, `/state.json` |
| MCP server | `vibe mcp` over stdio, `tools/list` | responds with tool list |
| CLI recaps | `vibe report week`, `vibe chart`, `vibe tokens --days 7` | all run; `tokens` parsed real local Claude transcripts across projects |
| Hosted Worker | `GET https://vibelog-live.nathancwatkins23.workers.dev/`, `/live`, `/state.json` | 200; snapshot `updatedAt` is 2026-06-12 (stale) |

Note: `vibe demo` writes `~/.vibelog/state.json` on every render, so running the demo clobbers a real user's last state.
The assessment ran it with a scratch `HOME`; a future fix should keep demo state in memory or in a temp dir.
Update 2026-11-01: fixed; demo mode keeps its state in memory and an E2E test guards it.

## Screenshots (from the demo)

- HUD: `docs/screenshots/app-overlay.png` (1920x1080, OBS browser-source size)
- Dashboard: `docs/screenshots/app-dashboard.png`
- Public page: `docs/screenshots/app-live.png`, mobile `docs/screenshots/app-live-mobile.png`
- Share page: `docs/screenshots/app-share.png`
- Share cards (server PNG): `docs/screenshots/app-share-card-stats.png`, `docs/screenshots/app-share-card-join.png`

## UI defects found and fixed during the assessment

1. Dashboard panels clipped their content: `.wrap` was `height: 100vh`, so the later embed-widget card squeezed "This session", "This week" and "Channel" to about 105 px. Changed to `min-height`.
2. Dashboard heatmap month labels collided ("OctNov") when the first column was a partial month. A label now drops the previous one when they are under three columns apart, like GitHub does.
3. `/live` overflowed horizontally on phones (541 px page on a 390 px viewport) because the header's right cluster could not wrap. It now wraps under 560 px; the Worker copy is synced.

All three are committed in `fix(ui): ...`.

## What works today

| Area | Status | Evidence |
|---|---|---|
| OBS HUD (`/overlay`) | Works | Transparent 1920x1080 strip: live/camera frame, projects ticker, now-building, live stats, social counts, milestone toasts, personal-best badge |
| Private dashboard | Works | Year heatmap with AI / streaming / VibeLog-score modes, per-project filter, session/week/channel panels, settings sheet, embed snippet |
| Public `/live` | Works | Live and offline states, profile bar, tiles, projects, build feed |
| `/share` + PNG cards | Works | OG/Twitter meta from request origin, `stats` and `join` cards via resvg, copy link, post to X, embed preview |
| Embed widget | Works locally and on the Worker | `embed.js` + `embed.html` |
| Git telemetry | Works | 5 s polling of lines, files, commits, branch |
| Claude tokens and cost | Works | `npx ccusage --json` for session totals; `claude-projects.ts` parses local transcripts for per-project attribution |
| Prompt to feature label | Works | Gemini Flash-Lite, local OpenAI-compatible (Ollama / LM Studio, loopback only), or template fallback; `redact()` + 140-char cap |
| Claude Code hooks | Works (code + tests) | `vibe hooks install`, fire-and-forget script |
| Recaps | Works | `vibe report`, `vibe report week`, `vibe chart` with streak and Vibe Score |
| Theming | Works | 10 presets, randomize, 8 custom colors with allowlist, per-page themes |
| Security model | Works, well tested | `isRemote()` origin gate, `PUBLIC_GET_ROUTES` allowlist, redactor, sanitized profile, XML-escaped card SVG |
| MCP server | Works | stdio, read state and change theme/profile |
| Snapshot publisher + Worker | Works, single tenant | Token-authed POST to Worker + KV; roundtrip tests; live deploy reachable |

## Not verified here (needs owner credentials or hardware)

- OBS WebSocket stream-time capture (`src/obs.ts`) against a running OBS.
- Twitch and YouTube OAuth and follower/subscriber polling with real apps.
- Discord and GitHub OAuth connect flows (S3) end to end.
- Gemini summarizer with a real key.
- A live publish from the agent to the deployed Worker (unit and roundtrip tests pass; the Worker has not received a snapshot since June).

## Stubbed, partial or missing

| Gap | Impact |
|---|---|
| No `LICENSE` file and the repo is private | Blocks the open-source/self-host positioning entirely |
| Not installable: `private: true`, version `0.0.0`, runs via clone + `tsx`; the npm name `vibelog` is taken by an unrelated package | Every user must clone and use pnpm; no `npx` one-liner |
| No CI workflow | Tests only run when someone remembers |
| No lint config | Style and bug classes not enforced |
| Claude-only token tracking | Excludes Codex, Gemini CLI, Cursor and Copilot users; ccusage itself now reads Codex logs, so the gap is narrow to close |
| `npx --yes ccusage` at runtime | Network fetch plus an unpinned third-party package executed every 30 s poll cycle; `claude-projects.ts` already parses transcripts locally and could replace it |
| Worker is single tenant | One `SNAPSHOT_KEY`, one `PUBLISH_TOKEN`; no handles, no accounts, no per-user isolation |
| No custom domain on the Worker | Still `*.workers.dev`; `vibelog.n8builds.dev` was the planned last step (update 2026-11-01: the target is now `vibelogs.dev`, which the owner owns) |
| Hosted snapshot stale since 2026-06-12 | The public page shows June data; looks abandoned to a visitor |
| Demo writes real state | `vibe demo` overwrites `~/.vibelog/state.json` (fixed 2026-11-01) |
| Duplicated pages | `worker/public/*.html` are hand-copied from `public/` (runbook step); drift risk |
| Two package managers | Root uses pnpm, `worker/` uses npm (`package-lock.json`) |
| Kick and X not supported | Only Twitch and YouTube for social stats |
| Discord D1-D3, auto-post G3, accounts X4 | Roadmap [LATER], unbuilt |
| Windows-first setup assumptions | Binds `0.0.0.0` so Windows OBS can reach WSL; macOS/Linux OBS flows not documented |

## Dependency health and security

Before this assessment:

- Agent: `pnpm audit` reported 46 advisories (1 critical, 14 high, 27 moderate, 4 low).
  All but one came through `@modelcontextprotocol/sdk` 1.29 (express stack: `proxy-addr`, `body-parser`, `qs`, `hono`, `ip-address`, `fast-uri`, `zod`).
  VibeLog only uses the stdio transport, so the HTTP-side advisories were not reachable at runtime, but they would still fail any downstream audit.
- Worker: `npm audit` reported 6 (5 high, 1 low), including `ws` memory exhaustion via wrangler's dev server.

Fixed in `chore(deps): ...`:

- Agent: MCP SDK 1.32.2, tsx 4.23, transitive `zod` pinned `^4.6.6` through a pnpm override. `pnpm audit`: no known vulnerabilities.
- Worker: wrangler 4.156, `@cloudflare/workers-types` 5.x. `npm audit`: 0 vulnerabilities.
- Tests, typechecks and an MCP stdio smoke test re-run green after the bump.

Still outdated (no known vulnerabilities, deliberate majors):

| Package | Current | Latest | Note |
|---|---|---|---|
| typescript | 5.9.3 | 7.0.2 | Major; the owner's other repos are mid-migration to TS 6/7 |
| @types/node | 22.x | 26.x | Fine while Node 22+ is the floor |
| commander | 12.1 | 15.0 | Majors are mostly ESM/Node-floor changes |

The stack is small and modern: three runtime dependencies (`@modelcontextprotocol/sdk`, `@resvg/resvg-js`, `commander`), no framework, static HTML with CSS variables, Node 24 verified locally.
This is a strength for an open-source local agent: little to rot, fast install, easy to audit.

## Overall verdict

Product completeness for a single streamer: high.
Readiness for other people to install it: low, for packaging reasons rather than missing features.
The cheapest high-leverage moves are license + public repo + CI + an installable CLI + multi-agent token sources, before any new hosted infrastructure.
