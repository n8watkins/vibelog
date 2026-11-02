# VibeLog - user documentation outline

Status: proposal, 2026-11-01.
Target: a docs site at `vibelogs.dev/docs` (or the repo `docs/` rendered on GitHub until then).
Every page should open with a one-sentence summary and end with "Next:" links.

## 1. Get started

1. **What is VibeLog** - the one-liner, the four surfaces, the privacy promise, a 30-second GIF of the HUD.
2. **Install** - Node 22+, `npx vibelog-cli init`, or clone for contributors; Windows + WSL, macOS, Linux tabs.
3. **First run in 5 minutes** - `vibe demo`, then `vibe start` in a real repo, open the dashboard.
4. **Add the HUD to OBS** - browser source URL, 1920x1080, transparency, WSL-to-Windows networking, scene layout tips.
5. **Wire up Claude Code hooks** - `vibe hooks install`, what the hook sends, how to turn it off.

## 2. Daily use

1. **Driving the HUD** - `vibe building`, `vibe mark`, modes, `vibe end`.
2. **The dashboard** - heatmap modes, project filter, session/week/channel panels.
3. **Recaps** - `vibe report`, weekly rollups, `vibe chart`, Vibe Score explained.
4. **Tokens by project** - `vibe tokens`, how attribution works, limits.
5. **Sharing** - `/share`, the stats and invite cards, posting to X.
6. **Embedding** - the `<script>` snippet, sizing, targets.

## 3. Customize

1. **Themes** - presets, randomize, custom colors, per-page themes.
2. **Profile** - name, bio, X handle, header.
3. **Summarizer** - template, local LLM (Ollama, LM Studio), Gemini; privacy trade-offs of each.

## 4. Integrations

1. **OBS WebSocket** - enabling it, password storage, stream-time capture.
2. **Twitch** - registering an app, `vibe twitch login`, what is read.
3. **YouTube** - API key or OAuth, channel id.
4. **Discord and GitHub** - connect flows and what they unlock.
5. **AI agents** - Claude Code today; Codex, Gemini CLI and others as they land.
6. **MCP** - `vibe mcp`, adding it to Claude Desktop or Claude Code, available tools.

## 5. Going public

1. **Public routes and the tunnel** - `vibe share`, what remote viewers can and cannot reach.
2. **Self-host your public page** - deploy the Worker to your own Cloudflare account, set the publish token, attach a custom domain.
3. **Hosted by us (planned, paid)** - claiming a handle, pairing the agent, hosted plan features.
4. **Snapshot preview** - see exactly what gets published.

## 6. Privacy and security

1. **What VibeLog reads, and what it never reads** - commits and counts, not keystrokes or code.
2. **What leaves your machine** - nothing by default; the snapshot field list when you publish.
3. **Dollar spend** - hidden on public surfaces by default; token counts stay public; `vibe privacy cost show|hide` or the dashboard toggle (`publicShowCost`).
4. **Secrets** - `~/.vibelog/secrets.json`, chmod 600, no environment variables.
5. **Streaming safety checklist** - the three leak surfaces, what to do if a key appears on screen.
6. **Threat model** - origin gate, redactor, allowlists, card escaping.

## 7. Reference

1. **CLI reference** - every command and flag, generated from commander.
2. **Configuration files** - `settings.json`, `secrets.json`, `config.json`, `events.jsonl`.
3. **HTTP routes** - public versus localhost-only, response shapes.
4. **Snapshot contract** - fields, versions (from `docs/SNAPSHOT_CONTRACT.md`).
5. **Theme variables** - the allowlisted CSS variables (from `docs/THEMING.md`).

## 8. Help

1. **FAQ** - adapted from `docs/FAQ.md`.
2. **Troubleshooting** - OBS shows nothing, tokens show 0, WSL networking, tunnel 403s.
3. **Contributing** - dev setup, tests, style, the streaming-safety rules from `CLAUDE.md`.
4. **Changelog and roadmap** - generated changelog, link to the public roadmap.
