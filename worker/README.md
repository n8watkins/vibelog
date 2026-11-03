# VibeLog Worker — Deploy Guide

> **DEPLOYED & VERIFIED 2026-06-12.** Live at https://vibelog-live.nathancwatkins23.workers.dev
> (account `nathancwatkins23`). KV namespaces created and wired into `wrangler.toml`;
> `PUBLISH_TOKEN` set as a Wrangler secret. Steps 1-5 are done — only the cosmetic
> custom-domain step (`vibelog.n8builds.dev`) remains. The "First-time setup" steps below
> are kept as the reference re-deploy procedure.

This directory contains a Cloudflare Worker that stores the published snapshot
in KV and serves the public `/live` page 24/7, independent of the local
VibeLog agent.

## Architecture

```
Local agent (src/agent.ts)
  POST /publish  ──────────────────────────────────→  Worker
                  Authorization: Bearer $PUBLISH_TOKEN
                  { state, profile, theme }           ↓ stored in KV

Browser / OBS
  GET /             →  landing.html (marketing front door, static assets)
  GET /live         →  live.html (static assets)
  GET /embed        →  embed.html (G4 widget, static assets)
  GET /embed.js     →  loader script
  GET /shots/*.png  →  product screenshots (static assets)
  GET /state.json   →  { ...LiveState }   (KV snapshot.state)
  GET /api/profile.json  →  { profile }  (KV snapshot.profile)
  GET /api/theme.json    →  { vars }     (KV snapshot.theme)
```

### How live.html is served

`live.html` is committed to `worker/public/live.html` (a copy of
`public/live.html`). Wrangler's `[assets]` binding serves this directory at
the Worker's origin. The Worker rewrites `GET /` and `GET /live` to
`/live.html` before forwarding to the `ASSETS` binding, so the client page is
served byte-for-byte identically to what `src/agent.ts` serves.

The same applies to the embed widget (G4): `worker/public/embed.html` and
`worker/public/embed.js` are copies of the root `public/` files, served at
`/embed` and `/embed.js` (the `/embed.js` loader derives its origin at runtime,
so the same file works on `*.workers.dev` and the custom domain).

`/` is the **marketing front door** — the Worker rewrites it to `landing.html` (a copy
of `public/landing.html`), with the landing page's screenshots served from
`worker/public/shots/*.png`. `/live` is the public profile, `/embed` the G4 widget.

When `public/{live,landing,embed}.html`, `public/embed.js`, or `public/shots/*.png`
are updated, re-copy:

```bash
cp public/live.html    worker/public/live.html
cp public/landing.html worker/public/landing.html
cp public/embed.html   worker/public/embed.html
cp public/embed.js     worker/public/embed.js
cp public/shots/*.png  worker/public/shots/
```

Then re-deploy (`wrangler deploy` from the `worker/` directory).

## First-time setup

### 1. Install dependencies

```bash
cd worker
npm install
```

(Do NOT run `npm install` at the repo root — the root package is isolated
from this worker.)

### 2. Create the KV namespace

```bash
wrangler kv namespace create SNAPSHOTS
```

Copy the returned `id` value into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SNAPSHOTS"
id = "<paste the id here>"
```

For local dev (`wrangler dev`) you also need a preview namespace:

```bash
wrangler kv namespace create SNAPSHOTS --preview
```

Add it to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SNAPSHOTS"
id = "<production id>"
preview_id = "<preview id>"
```

### 3. Set the publish token

Choose a strong random secret (e.g. `openssl rand -hex 32`), then:

```bash
wrangler secret put PUBLISH_TOKEN
```

Enter the secret when prompted. This is the token the local agent will send
as `Authorization: Bearer <token>` on `POST /publish`. Store the same value
in `~/.vibelog/secrets.json` as `publish.token` (alongside `publish.url`, the
full `POST /publish` endpoint) — this is already wired: the agent reads
`secrets.publish` and POSTs to `secrets.publish.url` (see `src/agent.ts`).

**Never commit the token or print it to the terminal.**

### 4. Deploy

```bash
wrangler deploy
```

Wrangler will print the Worker URL (e.g. `https://vibelog-live.<account>.workers.dev`).

## Updating

Re-deploy any time `src/worker.ts` or `worker/public/live.html` changes:

```bash
wrangler deploy
```

## Local development

```bash
wrangler dev
```

This runs the Worker locally on `http://localhost:8787`. You can test
`POST /publish` with curl:

```bash
TOKEN="your_token_here"
curl -s -X POST http://localhost:8787/publish \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"state":{"isLive":true},"profile":{"displayName":"Nate"},"theme":{"--accent":"#a06bff"}}' \
  -w "\nHTTP %{http_code}\n"
```

Then verify reads:

```bash
curl -s http://localhost:8787/state.json | jq .
curl -s http://localhost:8787/api/profile.json | jq .
curl -s "http://localhost:8787/api/theme.json?page=live" | jq .
```

## Running tests

From the **repo root** (uses root's tsx devDep):

```bash
node --test --import tsx "worker/src/*.test.ts"
```

This runs both `worker.test.ts` (pure helpers) and `roundtrip.test.ts` (drives
the actual `fetch` handler with an in-memory KV stub: publish → store → serve).

Or from inside `worker/` after `npm install`:

```bash
npm test
```

Note: `npm test` runs the full 38-test suite — the `test` script globs
`src/*.test.ts`, covering both `worker.test.ts` (27 tests) and
`roundtrip.test.ts` (11 tests).

Tests cover:
- `timingSafeEqualStr` — equal/not-equal/different-length/unicode
- `routeKind` — all routes + method sensitivity
- Snapshot field extractors (`extractState`, `extractProfile`, `extractTheme`)
- `SNAPSHOT_KEY` constant

## Typechecking

```bash
# From worker/
npm run typecheck
# (Requires @cloudflare/workers-types: cd worker && npm install first)
```

The root `npm run typecheck` is unaffected — it only covers `src/**/*.ts`.

## Security notes

- `POST /publish` is the only write path. It is gated by constant-time token
  comparison (`timingSafeEqualStr`) to prevent timing attacks.
- Body size is capped at 256 KB; oversized requests get a 413.
- The snapshot never contains secrets — only the already-public surface
  (`state`, `profile`, `theme` vars) that `src/agent.ts` already serves
  publicly over the Cloudflare tunnel.
- `PUBLISH_TOKEN` is a Wrangler secret; it never appears in `wrangler.toml`
  or in logs.
- All GET responses carry `Access-Control-Allow-Origin: *` (they are
  intentionally public) and `Cache-Control: public, max-age=30`.
