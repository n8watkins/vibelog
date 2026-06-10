# VibeLog Infrastructure Plan

`docs/INFRA_PLAN.md` — status: proposal

VibeLog today is one local Node/tsx process (`src/agent.ts`) on `:4545` bound `0.0.0.0`, with an append-only `~/.vibelog/events.jsonl`, JSON session/state files, git polling, and `npx ccusage --json`. The overlay is a single static HTML file so OBS can load it, and `vibe share` tunnels the whole port through Cloudflare. The single most important invariant in the codebase is already documented in `state.ts` and `redact.ts`: **only user-typed names and numeric stats ever reach `LiveState` / `/state.json`; no paths, diffs, prompts, or secrets.** Every design below preserves that invariant.

A second invariant from `agent.ts` matters throughout: `isRemote()` gates tunneled/LAN callers to the four read-only `PUBLIC_GET_ROUTES` (`/`, `/overlay`, `/live`, `/state.json`). All new write endpoints and any endpoint that could touch a key must stay localhost-only by remaining outside that set.

---

## 1. Prompt → Feature-Summary Pipeline

### Goal
Turn a raw `UserPromptSubmit` prompt into a short generated "intended feature being built" description, instead of `onPrompt()`'s current first-sanitized-line behavior (`agent.ts`), and stream it to the overlay.

### Where the LLM call happens
**The local agent makes the call. The overlay never calls any LLM and never sees a key.** This is non-negotiable given the threat model: the overlay HTML is served on `/overlay` to remote tunneled viewers and is composited live into OBS. The data flow is strictly:

```
Claude Code hook (claude-hook.mjs)
  --POST raw prompt--> agent /hooks/claude/prompt  (localhost-only already)
  --agent calls summarizer (key from env, never logged)-->
  --redact()--> session.nowBuilding --> render() --> state.json --> overlay (GET, public-safe)
```

The key lives only in the agent's process env. The overlay only ever does `GET /state.json`, which by contract contains no key and no raw prompt.

### Key-leak enumeration and prevention

| Leak vector | How it leaks | Prevention |
|---|---|---|
| Browser bundle | Key embedded in `overlay.html`/JS shipped to viewers | Overlay never holds a key; all LLM calls are server-side in the agent. No build step injects env into HTML. |
| `/state.json` | Key written into LiveState | `LiveState` contract has no key field; summarizer output passes through `redact()` before `session.nowBuilding`. Gemini `AIza…` keys are already a redaction pattern. |
| Env echoed in terminal on stream | `printenv`, `echo $GEMINI_API_KEY`, a crash dumping `process.env` | Load key from `~/.vibelog/secrets.json` (mode 600, gitignored) **not** a shell-exported var, so it isn't in the streamed shell's environment. On error log `err.message` only, never the request. |
| Committed `.env` | Key committed to the public OSS repo | Key lives in `~/.vibelog/secrets.json` (outside the repo entirely). `.gitignore` ignores `.env`/`.env.*`; add `secrets.json` defense-in-depth. Ship `.env.example` with placeholders only. |
| Tunnel exposing localhost | `vibe share` forwards `:4545`; a debug route gets exposed | The summarizer endpoint is internal (agent calls Gemini directly; no inbound route uses the key). Any future "test summarizer" route must stay out of `PUBLIC_GET_ROUTES`. |
| Transcript spillover | Summary echoes a pasted secret from the prompt | `redact()` runs on the summary output, capped to 140 chars as `setBuilding` already does. |

### Alternatives

| Option | Cost | Latency | Overhead | Privacy | Key-exposure risk |
|---|---|---|---|---|---|
| **(a) Local agent → Gemini directly, local-only key** | ~$0 at Flash-Lite volumes | 1 round-trip (~300-800ms), off overlay critical path | Low | Prompt leaves machine to Google | Low if key in `secrets.json`, never logged |
| (b) Thin hosted proxy / edge function | Gemini + hosting (likely $0 free tier) | 2 hops | Must build/host/secure a public endpoint | Prompt → your server **and** Google | Lowest local risk, but you own a secret-bearing service |
| (c) No external LLM — local heuristic/template | $0 | ~0ms | Low; pure function | Fully local | None |
| (d) Claude session self-summarizes via hook | Folded into running session | Adds tokens/turns; fragile ordering | Author a self-summarize hook | Local-ish | None new |

### Recommendation: **(a) local agent calls Gemini 3.x Flash-Lite directly, fallback (c).**

VibeLog is a local-first, self-deployed solo tool. (a) keeps it single-process — no service to host or secure, which matters enormously for OSS self-deployers. The streamer already trusts their machine with the Gemini key the way they trust it with Claude credentials and git tokens. The privacy cost (prompt → Google) is acceptable and disclosed; the prompt already went to Anthropic.

Reject (b) for V1: it only helps a *hosted* product (Phase 1+) and turns a $0 local tool into a service you must operate. Keep it noted as the Phase-1 evolution. Reject (d) as primary: it pollutes the user's Claude token count (which VibeLog itself displays — a feedback loop) and hook ordering is fragile; fine as an *opt-in* no-second-provider mode.

**Cheap fallback (c) ships in the same change**: a `templateSummary(prompt)` pure function used when no key is configured, the call errors, or it times out. Zero-config still works and the overlay never stalls — best-effort exactly like ccusage and git polling already are.

### Data contract
Hook → agent is unchanged on the wire. `onPrompt` gains an async summarization step:

```
POST /hooks/claude/prompt   (localhost-only, already gated)
body: { prompt: string, cwd?: string }   // cwd added so summary is project-scoped (§2)

agent.onPrompt(raw):
  prompts += 1
  appendEvent({ type: "prompt_submitted", title: redact(firstLine).slice(0,120) })  // raw prompt NOT persisted
  summary = await summarize(raw)        // Gemini, ≤~1.5s budget, else template
  title = redact(summary).slice(0,140)  // SAME redact path as setBuilding
  session.nowBuilding = { title, mode }
  render() -> state.json
```

`summarize()`: input is the raw prompt (in-process only, never logged/persisted); output is one ≤140-char imperative phrase ("Add OAuth login with Discord"), no code/secrets/PII. Key from `~/.vibelog/secrets.json` (mode 600), read by the agent itself, never `export`ed into the streamed shell. Always wrapped in timeout + try/catch → template fallback; never throws into the hook path (mirrors `getClaudeUsageToday()` returning `null`). New module `src/summarize.ts` with a unit-testable `templateSummary()`.

---

## 2. Project + Activity Capture

### Goal
Make the dashboard a per-project activity log: which days a repo was worked on, commits/tokens per repo, "did I stream," which models. Today only the active `cwd` git stats and a *global* ccusage total are captured.

### What we already have to build on
- `claude-projects.ts` already attributes **tokens by project** by reading `~/.claude/projects/*.jsonl` grouped by each line's `cwd` (with request-id dedupe and a `labelProjects()` unique-suffix labeler). Cross-terminal/cross-session token attribution that needs no per-terminal coordination — it reads Claude's own transcripts after the fact.
- `events.jsonl` is the append-only log; `report.ts` rolls events into day/week summaries but is **project-blind**.

### Attribution key
**Project key = normalized git remote origin URL, falling back to repo-root path** when there's no remote. A remote is identical across terminals/clones/machines; `claude-projects.ts` keys on `cwd` (fragments across clones) so we reconcile each transcript `cwd` → repo root → remote. Add `getRemote(cwd)` to `git.ts` (`git config --get remote.origin.url`, normalized: strip credentials, `.git`, host-normalize `git@github.com:` ↔ `https://github.com/`). **Normalization must strip embedded credentials** (`https://user:token@…`) — a redaction concern.

### What gets persisted, and where
Make the existing event log project-aware rather than adding a new store. Every `appendEvent` gains a `project` field; model-bearing events gain `model`.
- **Days worked on a repo** → group events by `(project, localDate)`.
- **Commits per repo** → at session start and on `Stop`, record `git_snapshot { project, commits, linesAdded, linesRemoved }` from `getStats`.
- **Tokens per repo** → already from `claude-projects.ts`, reconciled to the remote key and joined on the dashboard.
- **Did I stream** → tag `session_started`/`session_ended` with `project`; a session that day = "streamed."
- **Models used** → collect the `model` set per project from the `assistant` lines in `~/.claude/projects` (extend the row reader) — avoids needing model in the hook path.

### Storage shape — decision

| Option | Verdict |
|---|---|
| **Extend append-only `events.jsonl` (+ `project`,`model`)** | **Chosen.** Smallest change, reuses `appendEvent`/`readEvents`/`report.ts`, no deps, OSS-portable, no migration (tokens/models come from `~/.claude/projects`). |
| SQLite | Rejected for now: native/dep surface, breaks "drop-in tsx," over-engineered for one user's volume. The real future bottleneck is re-reading `events.jsonl` per dashboard poll — fix with caching (like `usageCache`), not a DB. |
| JSON-per-project | Rejected: write-coordination across concurrent terminals reintroduces the locking the append-log avoids. |

Backward compatible — old events lack `project` and fall into an "unknown/global" bucket.

### Dashboard surface
Extend `/api/dashboard.json` (already localhost-only) with `projects: [{ key, label, days, commits, tokens, models, streamed }]`. **Keep repo identities/remotes on the private dashboard only — never `/state.json`/the public overlay.**

---

## 3. Open-Source + Self-Deploy + Light Social Layer

**Phase 0 — polished self-deployed solo tool (where we are).** Harden + document the single-process local-first tool: zero-config `vibe start`, OBS overlay, Cloudflare share, the §1 summarizer, the §2 per-project log, the §4 safety checklist in `CLAUDE.md`/README. A great OSS repo anyone clones and runs with no account and no server. Stays free forever; this is the center of gravity.

**Phase 1 — optional hosted profile pages + OAuth.** Smallest viable hosted component: one static-ish web app + one edge function (Workers/Pages/Vercel/Deno Deploy) doing three things — OAuth login, store a small profile row, serve `vibelog.dev/u/<handle>`. The local agent optionally **pushes a redacted, already-public-safe rollup** to it; the agent stays source of truth, the service is a CDN cache. **The §1 Gemini key never goes to this service.**
- **Auth:** OAuth via Discord / YouTube(Google) / GitHub; no passwords. Self-deployers can run Phase 1 with their own OAuth apps (documented) → the hosted instance is "the official deployment," not lock-in.
- **Profile data** lives in the hosted store (one row/user: handle, linked OAuth IDs, optional GitHub/Discord/socials/website, theme, latest redacted rollup). All telemetry detail stays local; only the curated public subset uploads.

**Phase 2 — social/community + theming.** Public profiles list socials, a "spin up a Discord community" button (Discord OAuth), discoverability (who's live, leaderboards from public rollups), and **overlay theming from templates** — since the overlay is one self-contained HTML file, a theme is just a CSS/variables bundle selected on the profile. Low-risk: touches presentation only, never the `LiveState` contract.

### The honest trade-off
There is **no real profit** here — telemetry-for-streamers is a thin niche, and running an authenticated, secret-bearing, abuse-exposed SaaS costs more than plausible revenue. Argue for **open-source self-deploy as the primary model**: it's the only path where the streamer's machine, keys, and data stay on the streamer's machine — also the strongest answer to the §1 key-exposure threat model. The hosted layer is a *thin optional convenience* (profiles + discovery), fundable as a community/"official instance" thing, never a gate in front of the core tool.

### 2-3 consequential decisions before Phase 1
1. **Identity & data-ownership boundary** — exactly which fields cross local→hosted, and deletion/right-to-be-forgotten. Same redaction discipline as §1, applied to profiles.
2. **OAuth scope minimalism & secret custody** — narrowest scopes (esp. the powerful Phase-2 Discord `bot`/`guilds`); the hosted service now holds client secrets/bot tokens, isolated from the OSS repo and from users' machines.
3. **Self-host parity vs official instance** — are self-deployers first-class (own profile service + OAuth apps) or is `vibelog.dev` the only social graph? Hard to reverse; shapes the whole architecture.

---

## 4. Streaming-Safety Checklist for `CLAUDE.md`

### Copy-pasteable `CLAUDE.md` lines
```
## Streaming safety (this machine streams live to Twitch/OBS)
- NEVER print secrets to the terminal: no `cat .env`, `printenv`, `env`,
  `echo $ANY_API_KEY`, or any command that displays a key/token.
- Keys live in ~/.vibelog/secrets.json (mode 600), never exported into the
  streamed shell and never committed. Read them in code, never echo them.
- All text bound for the overlay MUST pass through redact() (src/redact.ts)
  before it touches LiveState/state.json. Never add a raw prompt, path, diff,
  or key field to the LiveState contract (src/state.ts).
- Never expose a key-bearing route over the Cloudflare tunnel. Only the
  read-only PUBLIC_GET_ROUTES (/, /overlay, /live, /state.json) may be public;
  everything else is localhost-only (see isRemote() in src/agent.ts).
- If a secret appears on screen, STOP, rotate the key immediately, continue.
  Assume any on-air key is burned.
```

### On-air operational checklist
- [ ] **Secrets out of the shell env** — key in `~/.vibelog/secrets.json` (chmod 600), not `export GEMINI_API_KEY=…`.
- [ ] **Never `cat`/`less`/open** `.env`, `secrets.json`, `~/.aws/`, `~/.config/gh`, `~/.ssh` on stream.
- [ ] **`.gitignore` hygiene** — `.env`, `.env.*`, `secrets.json` ignored before the first on-air commit. Ship `.env.example` placeholders only.
- [ ] **Pre-stream scan** — `git status` clean of secret files; grep the tree for `AIza`, `sk-`, `ghp_`, `xox` (patterns `redact.ts` already knows) before pushing.
- [ ] **Scrub before any overlay write** — every `nowBuilding`/`buildLog`/mark path routes through `redact()` + length cap (true in `setBuilding`/`addMark`/`onPrompt`; the new summarizer must too).
- [ ] **Logging discipline** — summarizer logs `err.message` only, never the request/headers/key. No `console.log(process.env)`, ever.
- [ ] **Devtools is a leak surface** — if you open the overlay in a browser on stream, the Network tab shows responses; confirm `/state.json` carries no key.
- [ ] **Three leak surfaces** — (1) terminal (env/file prints/crash dumps), (2) browser devtools (network/console), (3) `/state.json` itself. Audit all three after any state-contract or summarizer change.

### If a key is exposed on-air
1. Stop sharing that surface immediately.
2. **Rotate the key now** in the provider console. Treat clip/VOD as permanent capture.
3. Replace it in `~/.vibelog/secrets.json` off-camera (agent reads the file, so no visible shell re-export).
4. If it was ever committed, scrub history (`git filter-repo`) + force-push, then rotate again.

---

## Open Decisions for the Owner
1. **Summarizer provider & privacy disclosure (§1)** — confirm Gemini Flash-Lite default, accept prompts → Google, decide whether (d) "Claude self-summarizes" ships as an opt-in no-second-provider mode.
2. **Secret storage location (§1/§4)** — ratify `~/.vibelog/secrets.json` (chmod 600) as the canonical non-streamed key store instead of shell env. Load-bearing for the whole safety story.
3. **Project key = git remote vs repo path (§2)** — confirm credential-stripped normalized remote as primary identity, repo-root path fallback, per-project data stays on the **private** dashboard.
4. **Self-host parity vs official instance (§3)** — the hard-to-reverse Phase-1 choice.
5. **Hosted data boundary & OAuth scopes (§3)** — which exact fields leave the machine, deletion/ownership policy, narrowest scopes — settle before any byte uploads.

---

### Critical files for implementation
- `src/agent.ts`, `src/redact.ts`, `src/claude-projects.ts`, `src/report.ts`, `src/git.ts`
- New: `src/summarize.ts` (with unit-testable `templateSummary()`). Secret file: `~/.vibelog/secrets.json` (chmod 600, gitignored).
