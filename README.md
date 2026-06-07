# VibeLog (V0)

Live coding telemetry + an OBS overlay for vibe-coding streams. One local Node
process tracks your git activity and Claude token spend and serves a live HUD that
OBS reads as a Browser Source. **100% local, no accounts, $0.** See
[`V0_SPEC.md`](./V0_SPEC.md) for scope and [`PRD.md`](./PRD.md)… (the full product
vision) once added.

## Quick start

```bash
pnpm install

# Optional: set a default project name
pnpm vibe init --project "VibeLog"

# Start a session + the overlay agent (runs in the foreground — leave it up)
pnpm vibe start --cwd /path/to/the/repo/youre/streaming --title "Building the live tracker"
```

Then in **OBS** add a **Browser Source** pointing at:

```
http://localhost:4545/overlay
```

(Width 1920, Height 1080, transparent background — the HUD sits along the bottom.)

From **another terminal**, drive the overlay while you code:

```bash
pnpm vibe building "wiring the live stats card" --mode coding
pnpm vibe mark feature "live LOC counter works"
pnpm vibe mark bug "fixed double-count on stash"
pnpm vibe status        # dump current live state
pnpm vibe end           # end session, stop the agent
```

Build modes: `planning designing coding debugging polishing deploying shipping`.

### Make `vibe` a real command (recommended)

So `vibe` targets whatever repo you're in (instead of `pnpm vibe` from this dir):

```bash
alias vibe="npx tsx $(pwd)/src/cli.ts"
# then, from any project:  vibe start
```

## Auto-track with Claude Code hooks (optional)

Wire VibeLog into Claude Code so the overlay updates itself while you code — your
prompt becomes the "Now Building" card and git stats refresh right after each edit.

```bash
pnpm vibe hooks print              # preview the settings.json block
pnpm vibe hooks install --global   # ~/.claude/settings.json (all projects)
pnpm vibe hooks install --dir .    # ./.claude/settings.json (this project only)
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
- **Now Building**: whatever you type via `vibe building`. No AI, no Gemini.

## Safety

Every user-typed string written to the overlay passes through a redactor
(`src/redact.ts`) that scrubs API keys, tokens, private keys, and `key=value`
secrets before they can hit the public-facing state. The overlay only ever emits
text you typed + numeric stats — no paths, diffs, or prompts. Raw history is kept
private in `~/.vibelog/events.jsonl`.

```bash
pnpm test        # redactor tests
pnpm typecheck
```

## Going public (still free)

The agent serves a polished, shareable public page at **`/live`** — a richer,
full-screen view of the same state (great to link in your bio or pin in chat).
It shows an "Offline — back soon" state when no session is running, so the URL is
safe to share permanently.

To expose it to viewers over the internet, run a free Cloudflare Tunnel:

```bash
pnpm vibe share            # wraps `cloudflared tunnel --url http://localhost:4545`
# → viewers visit <the trycloudflare URL>/live
```

(`vibe share` prints install instructions if `cloudflared` isn't present.)

## Files

```
hooks/
  claude-hook.mjs  dumb Claude Code hook → forwards to the agent (no deps)
src/
  cli.ts        vibe CLI (commander)
  agent.ts      HTTP server + state + git/ccusage pollers
  git.ts        git metrics
  ccusage.ts    Claude token totals (best-effort)
  redact.ts     secret scrubber  (+ redact.test.ts)
  state.ts      LiveState contract
  store.ts      ~/.vibelog persistence
public/
  overlay.html  the OBS HUD (transparent, self-contained)
  live.html     shareable public /live page (full-screen viewer view)
```
