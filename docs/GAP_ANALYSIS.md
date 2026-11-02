# VibeLog - gap analysis

Status: 2026-11-01.
Maps each feature in `docs/PRODUCT.md` to what exists today.
Legend: **Reuse** = works, ship as is; **Fix** = exists but broken or rough; **Missing** = not built.

## Collect

| Feature | State | Where | Gap |
|---|---|---|---|
| Git activity | Reuse | `src/git.ts` | None |
| Claude token spend and cost | Fix | `src/ccusage.ts` | Runs `npx --yes ccusage` every poll: network plus unpinned code execution; replace with the local transcript parser or a pinned dependency |
| Per-project attribution | Reuse | `src/claude-projects.ts`, `src/projects.ts` | Claude only |
| Codex, Gemini CLI, other agents | Missing | none | Needs a token-source interface; ccusage already reads Codex logs |
| Stream time (OBS) | Reuse, unverified here | `src/obs.ts`, `src/stream.ts` | Needs an end-to-end check against OBS 31+ |
| Twitch and YouTube growth | Reuse, unverified here | `src/social.ts`, `src/twitch-oauth.ts` | Requires each user to register OAuth apps; document or broker |
| Kick | Missing | none | Low priority |
| Now-building label | Reuse | `src/summarize.ts` | None |
| Milestones | Reuse | `src/cli.ts` | None |

## Show

| Feature | State | Where | Gap |
|---|---|---|---|
| OBS HUD | Reuse | `public/overlay.html` | Add an OBS setup check (browser-source size, transparency) to onboarding |
| Private dashboard | Reuse (fixed) | `public/dashboard.html` | Panel clipping and month labels fixed in this pass |
| Public `/live` | Reuse (fixed) | `public/live.html` | Mobile overflow fixed in this pass |
| `/share` + PNG cards | Reuse | `public/share.html`, `src/share.ts` | None |
| Embed widget | Reuse | `public/embed.js`, `public/embed.html` | None |
| Terminal recaps | Reuse | `src/report.ts`, `src/chart.ts` | None |
| Demo mode | Reuse (fixed 2026-11-01) | `src/agent.ts` | Demo no longer writes `state.json`, `session.json` or `events.jsonl`; E2E test in `src/demo.test.ts` |

## Make it yours

| Feature | State | Where | Gap |
|---|---|---|---|
| Themes, presets, custom colors, per-page | Reuse | `src/theme.ts`, settings sheet | None |
| Profile | Reuse | `sanitizeProfile` | None |
| Premium theme packs | Missing | none | Needs a pack format; later |

## Trust and safety

| Feature | State | Where | Gap |
|---|---|---|---|
| Redaction | Reuse | `src/redact.ts` | None |
| Origin gate and public route allowlist | Reuse | `src/agent.ts` | None |
| Secrets file, no env vars | Reuse | `src/secrets.ts` | None |
| Public dollar spend hidden by default | Reuse (new 2026-11-01) | `toPublicState` in `src/state.ts`, `publicShowCost` setting | None; owner decision, reversible with `vibe privacy cost show` |
| Snapshot preview before publish | Fix | `/state.json` exists | No dedicated "this is exactly what will be published" screen |
| Open-source license | Missing | none | Blocks the whole positioning |
| Public repository | Missing | repo is private | Needs a final secret scan (done 2026-11-01, clean) and a decision |

## Packaging and quality

| Item | State | Gap |
|---|---|---|
| Installable CLI | Missing | `private: true`, `0.0.0`, clone + tsx only; publish as `vibelog-cli` with a `vibe` bin |
| `vibe init` onboarding | Fix | Exists for project name; needs repo selection, OBS check, optional OAuth, publish setup |
| CI | Missing | No workflow; add test + typecheck + audit for root and `worker/` |
| Lint | Missing | No ESLint or Biome config |
| Single package manager | Fix | Root pnpm, worker npm; make `worker/` a pnpm workspace package |
| Duplicated page copies | Fix | `worker/public/*.html` hand-copied (drift now fails `worker/src/public-sync.test.ts`); generate at build or serve one source |
| Cross-platform docs | Fix | WSL + Windows OBS is the documented path; add macOS and Linux |
| Dependency audit | Reuse (fixed) | Both packages audit clean after this pass |

## Publish

| Feature | State | Where | Gap |
|---|---|---|---|
| Snapshot publisher | Reuse | `src/publish.ts` | Cadence and token config only in secrets file |
| Self-host Worker + KV | Reuse | `worker/` | Single tenant; KV write limit caps free-tier publishers; custom domain (`vibelogs.dev`) not attached |
| Self-host guide | Fix | `docs/DEPLOY_RUNBOOK.md`, `worker/README.md` | Written for the owner; needs a user-facing version |
| Hosted multi-tenant relay | Missing | none | Handles, per-user tokens, D1 or Durable Objects, rate limits |
| Owner auth and agent pairing | Missing | none | Device-code style pairing; GitHub sign-in |
| Billing | Missing | none | Stripe checkout + webhook for the hosted plan |
| Custom domains | Missing | none | Cloudflare for SaaS custom hostnames |
| Public history beyond "latest" | Missing | none | Daily rollups per handle |

## Summary

- **Reuse:** almost everything a single user sees.
- **Fix (small):** ccusage invocation, snapshot preview, package-manager split, page duplication, onboarding.
- **Missing, before any hosting:** license, public repo, installable CLI, CI, lint, multi-agent token sources.
- **Missing, hosted plan:** multi-tenant relay, pairing, billing, custom domains, history.
