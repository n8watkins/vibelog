# VibeLog PRD

> This is the full product vision. The **V0 cut actually being built first** lives
> in [`V0_SPEC.md`](./V0_SPEC.md). Treat the phases here as the long-term roadmap;
> V0 deliberately ships only the local agent + overlay and adds the rest live.

## 1. Product Summary

**VibeLog** is a personal build journal and live coding telemetry system for AI-assisted developers.

It tracks what you work on across projects, coding sessions, Claude usage, commits, features, bugs, stream sessions, and daily progress. It turns that activity into private dashboards, GitHub-style activity charts, end-of-day reports, stream recaps, and optional public live pages/OBS overlays.

The product should be useful even when the user is **not streaming**. Streaming is an optional mode that adds public visibility, overlays, viewer-safe summaries, and richer artifacts.

## 2. Core Product Idea

VibeLog answers:

* What did I work on today?
* What projects are gaining momentum?
* What did I spend Claude tokens on?
* What features did I add?
* What bugs did I fix?
* What commits did I make?
* What should I work on next?
* What can I publish from today's session?
* If I streamed, what happened during the stream?

The key loop:

```txt
Start session
→ work normally with Claude / terminal / git
→ VibeLog tracks activity
→ mark features / fixes / decisions
→ end session
→ get summary, metrics, takeaways, next steps
→ update Vibe Chart
```

Streaming adds:

```txt
Start stream
→ public live tracker updates
→ OBS overlay updates
→ live stats show progress
→ end stream
→ generate recap, chapters, Discord post, changelog
```

## 3. Product Positioning

- **Primary:** a personal build journal for AI-assisted developers.
- **Secondary:** GitHub contribution graph + Claude usage dashboard + stream recap engine.
- **Streaming:** a live coding HUD and public build tracker for vibe coding streams.

## 4. Target User

Initial user: solo developer / creator building with Claude Code, Gemini, terminal workflows, Git, and occasional livestreaming. Optimized for AI-assisted coding, multiple active projects, terminal-heavy workflows, Claude Code usage, stream/content workflows, and daily reflection / project momentum tracking.

## 5. Goals

**Product:** track build activity even when not streaming; track Claude usage per session/project; track features/bugs/commits/LOC/build+test events; generate daily/session/stream summaries; a GitHub-style "Vibe Chart"; optional stream mode with OBS overlay and public `/live`; keep raw data local unless sanitized; make progress feel rewarding.

**Technical:** Next.js + Supabase + Vercel web app; a local Node/TS agent; Supabase Postgres for persistence; Supabase Realtime for live updates; Gemini only for sanitized summaries; never leak secrets to Gemini/Supabase/OBS/public; don't burn Claude tokens for tracking.

## 6. Non-Goals (V1)

Multi-user SaaS, paid accounts, team collaboration, browser extension, mobile app, full GitHub OAuth, auto-publish to YouTube, complex OBS scene switching, raw Claude transcript upload, raw diff upload, summaries from unsanitized secrets.

## 7. Product Modes

- **Daily Build Log** — used even when not streaming. Project activity, Claude usage, git changes, milestones, features, bugs, commits, daily summary, Vibe Chart contribution.
- **Focus Session** — a scoped work block (`vibe start --project stream-overlay`). Start/end time, project, milestones, tokens, commits, changed files, summary.
- **Stream Mode** — optional enhanced mode (`vibe stream start --title "..."`). Public live state, OBS overlay, live stats, stream timeline, end-stream recap, YouTube chapters, Discord recap, archive entry.

## 8. High-Level Architecture

```txt
LOCAL MACHINE
  Claude hooks · terminal heartbeat · git metrics · Claude usage scanner
  manual milestone commands · command wrapper
        ↓
  Local VibeLog Agent (redaction, project resolution, event aggregation, raw log)
        ↓
  Supabase Edge Function (validate ingest secret + schema, write sanitized)
        ↓
  Supabase Postgres (private tables, public-safe tables, realtime live state)
        ↓
  Next.js Web App (dashboard, live page, overlay, reports, vibe chart)
```

## 9. Tech Stack

- **Web:** Next.js App Router, TypeScript, Tailwind, shadcn/ui, Supabase JS, Recharts/Tremor, Vercel.
- **Backend:** Supabase Postgres, Auth, Realtime, Edge Functions, RLS.
- **Local agent:** Node + TypeScript, `tsx`, `commander`/`cac`, `chokidar`, `execa`, SQLite or JSONL, parse `ccusage --json`.
- **AI:** Gemini for sanitized summarization with structured JSON + a budget manager.

## 10. Repo Structure (eventual)

```txt
vibelog/
├─ apps/web/ (app: dashboard live overlay streams vibes projects; components; lib)
├─ apps/agent/ (src: cli collectors redaction metrics claude git sync index.ts)
├─ packages/shared (schemas types constants)
├─ packages/db (migrations queries)
├─ packages/ai (gemini-client prompts budget-manager output-sanitizer)
├─ packages/metrics (vibe-score token-analysis git-metrics session-summary)
├─ supabase/functions (ingest-event generate-report publish-live-state)
├─ supabase/migrations
└─ docs (PRD SECURITY ARCHITECTURE)
```

## 11. Core Entities

### 11.1 Project
```ts
type Project = {
  id: string; userId: string; name: string; slug: string;
  summary: string | null; localRootPathHash: string | null;
  publicName: string | null; isPublic: boolean;
  status: "active" | "paused" | "backlog" | "archived";
  createdAt: string; updatedAt: string;
};
```
Store raw local paths locally; Supabase only gets hashed/sanitized root identifiers.

### 11.2 Session
```ts
type Session = {
  id: string; userId: string; projectId: string | null;
  title: string | null; mode: "focus" | "stream" | "daily";
  status: "active" | "ended"; startedAt: string; endedAt: string | null;
  summary: string | null; publicSummary: string | null; isPublic: boolean;
};
```

### 11.3 Stream
```ts
type Stream = {
  id: string; userId: string; sessionId: string; title: string;
  status: "live" | "ended"; startedAt: string; endedAt: string | null;
  primaryProjectId: string | null; vodUrl: string | null;
  publicSummary: string | null; discordPost: string | null;
  youtubeChapters: string | null; published: boolean;
};
```

### 11.4 Event
```ts
type Event = {
  id: string; userId: string; projectId: string | null;
  sessionId: string | null; streamId: string | null;
  type:
    | "session_started" | "session_ended" | "stream_started" | "stream_ended"
    | "project_switched" | "prompt_submitted" | "claude_response_finished"
    | "feature_marked" | "bug_fixed" | "blocker_marked" | "decision_marked"
    | "commit_created" | "build_failed" | "build_passed" | "build_recovered"
    | "tests_failed" | "tests_passed" | "files_changed" | "tokens_updated"
    | "summary_generated";
  title: string | null; summary: string | null;
  metadata: Record<string, unknown>; publicSafe: boolean; createdAt: string;
};
```

### 11.5 Metrics Snapshot
Periodic rollup of LOC, files (changed/created/deleted), commits, features, bugs, build/test pass/fail/recover counts, Claude token breakdown (input/output/cache create/cache read), and Gemini calls/tokens.

### 11.6 Public Live State
Viewer-safe live state for `/live` and `/overlay`: `isLive`, stream id/title, active project (id/name/summary), `nowBuilding` (title/description/mode), `buildLog[]`, `liveStats` (LOC, files, features, bugs, commits, claude tokens, gemini calls), `updatedAt`.

### 11.7 Daily Summary
Per-day: title, summary, takeaways[], nextSteps[], vibeScore, session/stream minutes, features, bugs, commits, claude tokens, gemini calls, published flag.

## 12. Supabase Tables

Initial: `profiles projects sessions streams events metrics_snapshots public_live_state daily_summaries reports settings`.

Optional later: `commits features bugs claude_usage gemini_usage stream_chapters discord_posts clip_ideas`.

## 13. Row Level Security

All tables RLS-enabled.

- **Public read:** `public_live_state`, published streams, published daily summaries, published vibe chart rows. Anyone reads public rows; no anonymous writes; only backend/service role writes.
- **Private:** `events`, `metrics_snapshots`, private sessions/streams, `settings`, raw-ish summaries. Authenticated owner reads/writes own rows; anonymous cannot; backend ingest writes after validation.

## 14. Security Requirements

**Golden rule:** raw activity stays local; only sanitized summaries and metrics go remote.

**Never reaches Gemini:** `.env` content, API keys, access tokens, private keys, service-account JSON, Supabase service role key, Gemini/Anthropic/OpenAI keys, raw terminal output (default), raw git diffs (default), private client names, unapproved paths, private URLs, raw Claude transcripts.

**Redaction pipeline:** `raw event → redactor → schema validator → public-safety classifier → Gemini/Supabase → output redactor → final destination`. The redactor scans both input and Gemini output. Patterns: `sk-… ghp_… github_pat_… AIza… xoxb-… Bearer … Authorization: password= api_key= secret= token= -----BEGIN PRIVATE KEY----- SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY` → replace with `[REDACTED_SECRET]`.

**Unsafe payload handling:** on high-confidence secret detection — block Gemini, block public publish, store local-only event, show `Private deployment work hidden from public view.`

**Public-safe mode** (`PUBLIC_SAFE_MODE=true`): no raw prompts/diffs/absolute paths/unapproved names leave the machine; public summaries must be generic and sanitized.

## 15. Local Agent

Observes and records activity without interfering with Claude (doesn't ask Claude to summarize, doesn't consume Claude tokens).

**CLI:** `vibe init`, `vibe project add/list`, `vibe active <project>`, `vibe start/end`, `vibe stream start/end`, `vibe mark feature|bug|decision|blocker "…"`, `vibe run <cmd>`, `vibe sync`, `vibe report today`, `vibe privacy-lock`.

**Local storage:** `~/.vibelog/` → `config.json projects.json events.jsonl raw/ cache/ vibelog.db`. Local raw data can include raw hook payloads, paths, terminal activity, raw command output, raw history. Remote data must be sanitized.

## 16. Claude Integration

Use Claude Code hooks: `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`.

- **UserPromptSubmit:** capture intent + cwd, map cwd→project, update activity score, optionally update Now Building (sanitized).
- **PostToolUse:** capture edits/writes/bash, update activity; never call Gemini directly.
- **PostToolUseFailure:** capture errors → possible debugging/build failure.
- **Stop:** mark response completion, aggregate session changes, maybe trigger summary scheduler.

Hooks POST locally to `http://localhost:4545/hooks/claude/{prompt,tool,failure,stop}`. The hook script is dumb; the agent is smart.

## 17. Claude Usage / Token Intelligence

Sources: V1 ingest `ccusage --json`; V2 parse Claude Code JSONL directly; V3 optional OpenTelemetry. Track input/output/cache-create/cache-read/total tokens, model, project, session, stream, day. Insights: tokens by project/session/hour, most expensive + highest-leverage sessions, token-to-feature/commit ratios, rabbit holes, token-heavy debugging blocks.

## 18. Git Metrics

Locally run `git status --short`, `git diff --numstat/--stat`, `git branch --show-current`, `git log`. Track lines added/removed, net LOC, files changed/created/deleted, commits, branch, commit messages, project activity.

## 19. Command Wrapper

`vibe run pnpm typecheck|test|build` tracks command, exit code, duration, project/session/stream, fail/pass, recovery. If a command failed before and later passes → emit `build_recovered`.

## 20. Milestones

Manual milestones matter because AI shouldn't guess everything. Types: `feature bug decision blocker polish deploy docs refactor win`. e.g. `vibe mark feature "Added public live state"`.

## 21. Vibe Score

Works streaming or not.

- **Base:** session completed +10, feature +20, bug fixed +15, decision +8, commit +10, build recovered +8, daily summary +10, meaningful activity +5.
- **Streaming bonus:** stream completed +25, public live page used +10, OBS overlay used +10, end-stream recap +20, YouTube chapters +10, Discord recap +15.
- **Tokens (capped):** +1 per 100k Claude tokens, max +10/day.

Rewards consistency, shipping, fixing, documenting, reflecting, streaming — not meaningless token burn.

## 22. Web App Pages

`/dashboard` (private control center), `/projects`, `/sessions`, `/streams` + `/streams/:id`, `/vibes` (GitHub-style activity graph), `/live` (public, safe data only), `/overlay` (OBS browser source), `/reports` (private generated reports). Details per section in the source PRD.

## 23. OBS Overlay

Bottom HUD: `Webcam | Projects | Now Building | Build Log | Live Stats`. Webcam is visual space, not a data card. Cards: Projects (active + secondary + status), Now Building (current task, description, mode, optional progress — from sanitized prompt/Gemini), Build Log (recent accomplishments + next step, updated after Stop/summaries), Live Stats (rotating code metrics / tokens / shipping / build health / session stats).

## 24. Public Live Page

A richer `/overlay`. Must not show raw prompts/paths/diffs/terminal logs/secrets/private names. Can show public project name, safe current task, safe recent updates, stream metrics, vibe score contribution, published timeline moments.

## 25. AI / Gemini System

**Use Gemini for:** Now Building rewrite, Build Log rewrite, daily takeaways, stream summary, YouTube chapters, Discord recap, changelog, next-session plan, token-spend interpretation.

**Don't use Gemini for:** counting LOC/files, reading secrets, parsing `.env`, build/test pass-fail, project mapping, live metrics, raw token totals.

**Budget:** `GEMINI_ENABLED`, `GEMINI_MODEL=gemini-2.5-flash-lite`, `MAX_GEMINI_CALLS_PER_DAY=150`, `…PER_SESSION=30`, `…PER_STREAM=80`, `MAX_GEMINI_INPUT_TOKENS_PER_CALL=1200`, `MAX_GEMINI_OUTPUT_TOKENS_PER_CALL=300`, `LIVE_SUMMARY_MIN_INTERVAL_SECONDS=120`, `BUILD_LOG_MIN_INTERVAL_SECONDS=300`.

**Safety:** before — sanitize input, remove secrets, strip raw logs, truncate, classify safety. After — parse strict JSON, sanitize every string, block if secret detected, write only safe fields.

## 26. Reports

Daily (what worked on, top projects, features, bugs, commits, tokens, gemini calls, takeaways, next steps), Session (duration, project, objective, milestones, metrics, summary, next step), Stream (title, duration, summary, timeline, features, bugs, commits, tokens, live stats, chapters, Discord recap, clip ideas, next-stream plan), Weekly (later: score, streaks, projects advanced, features/bugs, token trends, best sessions, rabbit holes, priorities).

## 27. Discord Recap

Generate a draft (Built / Stats / Takeaway / Next). V1 = draft only; V2 = webhook post after review.

## 28. YouTube Chapters

Generated after the stream from timeline events (start time, milestones, project switches, build recoveries, decisions, summary events) → `00:00 …` timestamp list.

## 29. Implementation Phases

- **Phase 0 — Security + Foundation:** Next.js app, Supabase project + Auth, base schema, RLS, agent skeleton, redaction utils, ingest Edge Function, private/public split. *AC: sign in; agent sends sanitized test event; dashboard shows it; anon can't write public tables; redaction catches fake secrets; Gemini not called yet.*
- **Phase 1 — Personal Build Log MVP:** project registry, start/end session, active project, manual milestones, git metrics, daily summary draft, dashboard overview. *AC: start session; mark features/bugs/decisions; metrics saved; dashboard shows today; daily summary from safe events.*
- **Phase 2 — Claude Usage Intelligence:** ccusage import, usage table, tokens by day/project/session, token cards, basic insights. *AC: tokens today / by project / most expensive session; totals update without calling Claude; light Vibe Score contribution.*
- **Phase 3 — Vibe Chart:** score calculator, daily summaries table, `/vibes`, hover details, project filters, stream/non-stream distinction. *AC: each day scored; chart renders; non-stream counts; stream adds bonus; inspect a day's score.*
- **Phase 4 — Stream Mode:** start/end stream, public live state, `/live`, `/overlay`, Realtime, live stats, timeline, public-safe summaries. *AC: start stream; `/live` updates safely; `/overlay` cards; live stats update; end creates record; no secrets/raw prompts public.*
- **Phase 5 — Gemini Summaries + Reports:** Gemini client, output schemas, budget manager, Now Building / Build Log summaries, daily + stream report generators, chapters, Discord recap, next-session plan. *AC: Gemini gets only sanitized input; output sanitized; reports draft-first; budget caps enforced; local fallback on failure.*
- **Phase 6 — Public Profile / Portfolio:** public profile, published stream archive, public project pages, published Vibe Chart, shareable report pages. *AC: publish/unpublish; public shows only approved data; private inaccessible; vibe chart public-safe.*

## 30. MVP Cut

```txt
Next.js dashboard · Supabase Auth/Postgres · local agent · project registry
session start/end · manual milestones · git metrics · Claude usage import
daily summary · basic Vibe Chart
```
Streaming comes after the private tracker works. *(Note: the V0 actually being built flips this — overlay first. See V0_SPEC.md.)*

## 31. First Build Tasks

1. Monorepo: pnpm workspace, `apps/web`, `apps/agent`, `packages/shared`, `packages/metrics`.
2. Supabase: project, migrations, RLS, profiles/projects/sessions/events + public_live_state.
3. Auth: Supabase Auth, dashboard shell, protected route.
4. Agent skeleton: CLI, local config, `vibe init/project add/start/end/mark`.
5. Redaction: redactor + fake-secret tests + block unsafe payloads.
6. Ingest: Edge Function, validate ingest secret + schema, write event.
7. Dashboard Today view: current session, recent events, basic metrics, milestone buttons.
8. Git metrics: LOC added/removed, files changed, store snapshot.
9. Claude usage import: `ccusage --json`, map to date/project/session, token cards.
10. Vibe Chart: scoring, calendar chart, day detail.

## 32. Open Questions

1. Final name: VibeLog / BuildPulse / ShipGraph / other?
2. Local raw storage: SQLite or JSONL first?
3. Gemini locally first or only via Edge Functions?
4. Public profile in V1 or later?
5. Discord posting automatic or review-only forever?
6. How strict is public-safe mode by default?
7. Should sanitized local prompts ever be stored remotely, or never?

## 33. Recommended Defaults

Name **VibeLog**; JSONL first, SQLite later; Next.js + Supabase + Vercel; Gemini via backend after Phase 5; public-safe mode on by default; reports draft-first; Discord manual-review first; streaming Phase 4 (not MVP); Vibe Chart private first.

## 34. Success Criteria

VibeLog succeeds if it makes the user more likely to build consistently: opens dashboard daily; can answer "what did I do today?"; sees token usage by project/session; marks features/bugs frictionlessly; gets useful daily summaries; finds the Vibe Chart motivating; stream mode gives viewers better context; end-stream reports save time; wants to build/stream again because progress is visible.

## 35. One-Sentence Vision

VibeLog turns AI-assisted coding sessions into a living build history: tracking what you worked on, what you shipped, what your tokens bought, and how your projects gain momentum over time.
