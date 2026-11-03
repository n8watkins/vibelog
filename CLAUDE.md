# CLAUDE.md — VibeLog

VibeLog is a **local-first OBS-overlay coding/streaming telemetry tool**: one Node/tsx
process (`src/agent.ts`, HTTP on `:4545`) serves a live **overlay** (OBS), a private
**dashboard**, a public **/live** page, and a **/share** card surface. No build step
(runtime is **tsx**); package manager is **npm**; pages are no-framework static HTML
driven by CSS custom properties.

**Start here:** read `docs/HANDOFF.md` (cold-start brief), then `docs/VISION.md`
(canonical roadmap — wins any conflict) and `docs/THEMING.md`. The root `README.md` is
the user-facing quickstart; `V0_SPEC.md` / `PRD.md` / `NEXT_STEPS.md` are **historical**.

## Streaming safety (this machine streams live to Twitch/OBS)

- NEVER print secrets to the terminal: no `cat .env`/`secrets.json`, `printenv`, `env`,
  `echo $ANY_API_KEY`, or any command that displays a key/token. Don't `cat`/`less`/open
  `.env`, `secrets.json`, `~/.aws/`, `~/.config/gh`, or `~/.ssh` while on stream.
- Keys live ONLY in `~/.vibelog/secrets.json` (chmod 600) — VibeLog reads **no env vars**.
  They're never exported into the streamed shell, never committed, never logged (log
  `err.message` only). Read them in code via `src/secrets.ts`; never echo them.
- All text bound for the overlay MUST pass through `redact()` (`src/redact.ts`) + a 140-char
  cap before it touches `LiveState`/`state.json`. Never add a raw prompt, path, diff, or
  key field to the `LiveState` contract (`src/state.ts`).
- Never expose a key-bearing route over the Cloudflare tunnel (`vibe share`). Only the
  read-only `PUBLIC_GET_ROUTES` may be public — `/`, `/overlay`, `/live`, `/landing`,
  `/share`, `/share/card.png`, `/state.json`, `/api/theme.json`, `/api/presets.json`,
  `/api/profile.json`, `/shots/*.png`. **Every write and every key-touching route stays
  OUT of that set**, so `isRemote()` in `src/agent.ts` 403s any tunneled/LAN caller.
- Dollar spend (`stats.costUsd`) is hidden on public surfaces by default (owner decision
  2026-11-01): every public read of the state goes through `toPublicState()` (`src/state.ts`)
  unless `publicShowCost` is true. Only a loopback `/state.json?hud=1` (the OBS HUD) gets it.
- Public settings-derived data is limited to allowlisted theme vars (`validateVars`) + the
  four sanitised profile fields (`sanitizeProfile`); both in `src/theme.ts`. Integration
  `connected` state is **derived** from token/secret presence (`integrationStatus()` in
  `src/oauth.ts`), never stored. Share cards are built from this public surface only and
  XML-escape every dynamic string into the SVG (`src/share.ts`).
- If a secret appears on screen, STOP, rotate the key immediately, then continue. Assume any
  on-air key is burned. The three leak surfaces to audit after any state/summarizer change:
  (1) terminal, (2) browser devtools network/console, (3) `/state.json` itself.

## Conventions

- **Commit after each logical, verified change.** Never add a Co-Authored-By or agent trailer. **Push only when asked.**
- Match surrounding style: vanilla TS, no new deps unless justified; pages are no-build
  static HTML + CSS vars. Ask before major/irreversible decisions or any [LATER] roadmap item.
- **npm only:** the agent, `worker/` and `landing/` each have one `package-lock.json`; release-kit and Dependabot both use npm, so never add a pnpm or yarn lock file.
- **Typecheck:** `npm run typecheck`. **Tests:** `node --test --import tsx "src/*.test.ts"`.
  Add tests for pure logic (see `src/theme.test.ts` / `src/share.test.ts` as the pattern).

<!-- release-kit -->
## Commits and releases

- Write every commit message as a Conventional Commit: `type(scope): subject`, with type one of feat, fix, perf, security, refactor, docs, test, build, ci, chore, style, revert. A hook and a CI check reject anything else; see RELEASING.md.
- Use `feat` and `fix` only for changes a user would notice: they become the release notes and the public build log.
- Write those subjects as patch notes, for users: what they can now do or what works better, not the file, library or test you touched. When the subject must stay technical, add a `Release-note: <plain sentence>` line to the body, or `Release-note: skip` for a change no user would notice.
- Don't bump versions, edit CHANGELOG.md or create tags by hand: `npm run release` does all three.
- Land changes through pull requests: a pre-push hook blocks pushing straight to main or a release branch, force pushes and moving release tags. Don't get around it with `--no-verify` or `RELEASE_KIT_ALLOW_DIRECT_PUSH=1` (that is for emergencies the owner asks for, and a Direct push alarm reports it either way).
<!-- /release-kit -->
