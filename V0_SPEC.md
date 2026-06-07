# VibeLog — V0 Spec (Overlay-First)

> The full PRD describes the eventual product. **This is the V0 cut: the smallest
> thing that puts a live coding HUD on stream this week.** Everything in the PRD
> that isn't here is deliberately deferred. Build the loop, stream it, grow it live.

## 0. The one goal of V0

Stream with a working overlay that shows, in real time:
- what project you're on + what you're building right now
- live code stats (LOC, files, commits)
- Claude token spend for the session
- a running build log of marked milestones

If a viewer can watch that update while you code, V0 is done. Nothing else matters yet.

## 1. What's in vs. out

### In (build this)
- **One local agent process** that watches git + ccusage AND serves HTTP.
- **`vibe` CLI** with ~6 commands.
- **In-memory `LiveState`** served as `/state.json` (mirrored to disk for restarts).
- **`/overlay`**: the OBS browser source HUD, served by the agent over localhost.

### Out (defer to PRD phases)
- ❌ **Supabase / any cloud / any account** — V0 is 100% local, $0.
- ❌ **Next.js** — overlay is a static page (vanilla or a Vite build) served by the agent.
- ❌ Public `/live` page — free Cloudflare Tunnel covers this when wanted (see §2).
- ❌ Monorepo with `packages/*` — one repo.
- ❌ Gemini + budget manager — milestones are your own text, no AI rewrite.
- ❌ Vibe Chart, daily/weekly reports, YouTube chapters, Discord recap.
- ❌ Claude hooks (4 of them) — V0 polls git/ccusage instead. Hooks are a nice
  upgrade later but add setup friction now.
- ❌ Auth / multi-user / public profile.

## 2. Architecture (V0)

```txt
LOCAL MACHINE  (everything — no cloud, no accounts, $0)
  git (numstat, log, branch)        ─┐
  ccusage --json                    ─┤→  VibeLog Agent  ──redact──▶  in-memory
  vibe mark / start / end (CLI)     ─┘   (one node process,           LiveState
                                          polls every ~5s)               │
                                          also runs a tiny HTTP server ──┤
                                                   │                      │
                          GET /state.json ◀────────┘                      │
                          GET /overlay    ◀── serves the HUD page ◀───────┘
                                   │
                                   ▼
                          OBS Browser Source → http://localhost:4545/overlay
```

**The free stack: the agent IS the server.** One Node process both tracks activity
and serves the overlay over `localhost`. OBS points a Browser Source at
`http://localhost:4545/overlay`; that page polls `http://localhost:4545/state.json`
every second. No Supabase, no Vercel, no Next.js, no accounts, no internet
required. Total cost: $0.

**What about a public `/live` page for viewers?** Deferred — and still free when you
want it. Because the agent already serves everything over HTTP, you expose it with
a **free Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:4545`)
which gives you a public URL while you stream, reusing the exact same server. No
new infrastructure. If you later want an always-on public page, a static deploy on
Cloudflare Pages / GitHub Pages / Vercel Hobby (all free tiers) reading from a free
KV store (Cloudflare KV / Upstash free tier) is the upgrade — but not in V0.

Decision: **V0 is 100% local. No Supabase.** Public visibility = Cloudflare Tunnel
when you want it.

## 3. The state shape (the contract)

This is the only data structure that matters in V0. Both the agent (writer) and
the overlay (reader) agree on it. It's a trimmed `PublicLiveState` from the PRD.

```ts
type LiveState = {
  isLive: boolean;
  sessionTitle: string | null;
  project: { name: string; status: "active" | "paused" } | null;
  nowBuilding: { title: string; mode: BuildMode } | null;  // last `vibe building`
  buildLog: string[];        // last ~6 marked milestones, newest first
  stats: {
    linesAdded: number;
    linesRemoved: number;
    filesChanged: number;
    commits: number;
    features: number;
    bugs: number;
    claudeTokens: number;    // session total from ccusage
  };
  startedAt: string | null;  // session start (for an on-overlay timer)
  updatedAt: string;
};

type BuildMode =
  | "planning" | "designing" | "coding"
  | "debugging" | "polishing" | "deploying" | "shipping";
```

Everything public-safe by construction: **no paths, no diffs, no prompts, no
project names you didn't type yourself.** The agent never puts raw data in here.

## 4. The agent

One process. Started by `vibe start`, stopped by `vibe end`. While running it:

1. Every ~5s, runs `git diff --numstat` + `git diff --cached --numstat` against
   the session's baseline commit to compute LOC/files. Counts new commits via
   `git log <baseline>..HEAD`.
2. Every ~30s, runs `ccusage --json`, sums tokens for entries since `startedAt`.
3. Maintains `buildLog` / counters from `vibe mark` / `vibe building` commands.
4. Runs every outgoing string through the **redactor** (see §6) before writing.
5. Writes the `LiveState` blob to the sink (Supabase row or local file).

Local raw cache: append every action to `~/.vibelog/events.jsonl`. That's your
private history — V0 doesn't render it, but you'll want it for the Vibe Chart later.

### State files
```txt
~/.vibelog/
  config.json     # project name, supabase url/key OR "local" mode
  session.json    # active session: baseline commit, startedAt, counters
  events.jsonl    # append-only raw log (private, local)
```

## 5. CLI (V0 surface)

```bash
vibe init                                  # write config, pick local vs supabase
vibe start --project overlay --title "..." # baseline = current HEAD, isLive=true
vibe building "wiring the live stats card" # sets nowBuilding (+ optional --mode)
vibe mark feature "live LOC counter works" # buildLog + features++
vibe mark bug "fixed double-count on stash"# buildLog + bugs++
vibe end                                   # isLive=false, flush, stop polling
```

`vibe building` doubles as the "Now Building" source — no Gemini needed. You just
say what you're doing; that's honest and reads fine on stream.

## 6. Redaction (the one piece worth keeping from day one)

Even in V0, since output is public, run every string written to state through a
redactor. Single regex pass, replace with `[REDACTED]`:

```txt
sk-[A-Za-z0-9]+        ghp_[A-Za-z0-9]+      github_pat_[A-Za-z0-9_]+
AIza[A-Za-z0-9_-]+     xoxb-[A-Za-z0-9-]+    Bearer\s+[A-Za-z0-9._-]+
(api[_-]?key|secret|password|token)\s*[=:]\s*\S+
-----BEGIN [A-Z ]*PRIVATE KEY-----
```

Plus: never write absolute paths. The agent only ever emits the project name you
typed, milestone text you typed, and numeric stats. That alone makes leaks nearly
impossible — the redactor is the safety net, not the primary defense.

Write a test with fake secrets that asserts they get scrubbed. ~20 lines, do it first.

## 7. The overlay page

Served by the agent at `http://localhost:4545/overlay`. Transparent background,
bottom HUD. Polls `/state.json` every ~1s and re-renders on change. Start as a
single static HTML/CSS/JS file (no build step); upgrade to a Vite + React build
(still served by the agent, still free) only if you want component structure.

```txt
┌──────────────────────────────────────────────────────────────────────────┐
│ [ webcam space ]   PROJECT        NOW BUILDING        BUILD LOG     STATS  │
│                    overlay        coding              ✓ live LOC    +842   │
│                    ● active       "wiring stats card" ✓ token sum   -219   │
│                                                       • fixed dbl    13 f  │
│                                                                     4 cmt  │
│                                                                     1.2M t │
└──────────────────────────────────────────────────────────────────────────┘
```

- Transparent bg so OBS composites it over your scene.
- Webcam slot is just empty space you position your camera over — not a data card.
- Stats card can rotate (LOC → tokens → build health) if it gets crowded.
- Update cadence: smooth, not jumpy. Debounce so it doesn't flicker every 5s tick.

## 8. Build order (each step streamable on its own)

1. `LiveState` type + redactor + redactor test. *(half day)*
2. Agent: HTTP server serving `/state.json` + a static `/overlay` page; git stats polling updates state. Point OBS at `localhost:4545/overlay`. **First on-stream overlay.** *(1 day)*
3. CLI: `start` / `end` / `mark` / `building`. *(half day)*
4. ccusage token integration. *(half day)*
5. (Optional, when you want viewers) `cloudflared tunnel --url http://localhost:4545` → public URL. *(minutes)*
6. Polish overlay visuals (this is the brand — spend real time here). *(ongoing, on stream)*

After step 2 you can already stream with a live LOC counter. Everything after is
an upgrade you can ship live as content.

## 9. Decisions locked for V0

- Name: **VibeLog**
- Stack: **100% local, free, no accounts.** Node agent serves overlay over localhost.
- One repo. Overlay = static page served by the agent (no Next.js).
- Local raw storage: JSONL.
- No Supabase, no Gemini, no Claude hooks, no reports in V0.
- Public-safe by construction + redactor net. Public-safe mode is the *only* mode.
- Public visibility (later, still free) = Cloudflare Tunnel over the same server.

## 10. The line to the full PRD

V0 → PRD mapping so nothing's thrown away:
- `LiveState` is a subset of `PublicLiveState` → grows into it.
- `events.jsonl` → feeds `metrics_snapshots` + the Vibe Chart (Phase 3).
- `vibe mark` → the milestone system (§20) unchanged.
- redactor → the §14 pipeline, just without the Gemini/output stages yet.
- in-memory `LiveState` + JSONL → splits into the Supabase table set (§12) when
  auth + multi-device land. Cloudflare Tunnel bridges the gap until then.

Build V0. Stream it. Add PRD phases live, in front of an audience. That *is* the brand.
```