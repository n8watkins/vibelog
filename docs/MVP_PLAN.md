# VibeLog — V1 MVP Build Plan (Phase 1, executable)

`docs/MVP_PLAN.md` — status: **PR1–PR3 BUILT + merged to master (deploy on hold)** · created 2026-06-11
· See `docs/HANDOFF.md §5` for the current build state + the deploy runbook.

> The detailed, build-ready plan for the **V1 MVP**. Strategy/why lives in `VISION.md §6`; phasing +
> economics in `PLATFORM_PLAN.md`. This is the executable spec a builder follows for Phase 1.
> **No code written yet.** Decisions below use recommended defaults; Nathan can override the ones in §6.

## 1. Definition of done

**"Nathan's VibeLog, live on a public URL, 24/7, for $0."** A visitor loads the URL (free
`*.workers.dev` first, `vibelog.natebuilds.dev` later) and sees Nathan's `/live` page — current stats,
calendar, profile, theme — **even when his laptop is off**, served from the last published snapshot.
Single-tenant. No accounts, billing, multi-tenancy, or embed (those are Phase 2+).

## 2. The four components (and the seam between local & cloud)

```
LOCAL agent (existing)                         CLOUD (new, thin)              VISITOR
 ① summarizer (provider-flexible)               ③ Worker + KV                 GET page
 ② publisher ──POST snapshot (Bearer token)──▶   POST /publish (token→KV)  ──▶ /live + /state.json
                                                 GET serves from KV (cached)    /api/profile|theme.json
                                                 ④ custom domain (last)
```

### Component ① — Local-LLM summarizer (edit `src/summarize.ts` + tests)
- **Add a provider abstraction.** New `callOpenAICompatible(prompt, baseUrl, model)` →
  `POST {baseUrl}/v1/chat/completions` (same system prompt, small max_tokens, `AbortController`
  timeout, parse `choices[0].message.content`). Covers **Ollama** (`:11434/v1`) and **LM Studio**
  (`:1234/v1`) in one path.
- **Auto-detect** (`detectLocalLLM()`): short-timeout `GET /v1/models` against the two localhost ports;
  return the first reachable `{baseUrl, model}`. Cache the result.
- **Resolve provider** in `summarize()`: `provider: "auto" | "gemini" | "local" | "template"` →
  `auto` = local-if-detected → else gemini-if-key → else template. Keep the existing `sanitizeLabel`
  + template fallback wrapping (never throws).
- **Config:** non-secret `summarizer: { provider, baseUrl?, model? }` in `~/.vibelog/settings.json`
  (via `src/store.ts`); the Gemini key stays in `secrets.json`. Extend `Summary["source"]` to add
  `"local"`.
- **Tests:** provider resolution, OpenAI-compatible response parsing (mock fetch), detection fallback.
- **Security:** local calls hit localhost only; redact()+cap still applies downstream; log `err.message`
  only; never log the prompt or key. No change to `PUBLIC_GET_ROUTES`.

### Component ② — Publisher (new `src/publish.ts` + wire into `src/agent.ts`)
- **Snapshot = the existing public surface.** Reuse `buildShareData` (`src/share.ts`) + the public
  `/state.json` subset + `profile` + resolved `theme` into one JSON: `{ state, profile, theme }` — the
  exact three things `public/live.html` already fetches (so the cloud page reuses the client unchanged).
  **No prompts, paths, diffs, or keys** (same invariant as today).
- **Cost-safe publish logic** (the §5 cost lever, hardcoded for Nathan in MVP):
  - Compute a content hash; **skip the POST if unchanged** (write-on-change).
  - **Throttle:** min-interval ~**300 s while live**, ~**900 s while idle**; publish once on startup and
    once on a clean shutdown (final state). (These intervals become the free/Pro paywall in Phase 3.)
- **Transport:** `POST {url}` with `Authorization: Bearer {token}`; non-blocking, never throws, retry
  next tick on error (log `err.message` only).
- **Config:** `publish: { url, token, liveCadenceSec?, idleCadenceSec? }` in `secrets.json` (token is a
  secret). **Outbound only — adds no inbound route**, so `isRemote()`/`PUBLIC_GET_ROUTES` are untouched.
- **Tests:** hash/dedup + throttle (pure functions); snapshot shape.

### Component ③ — Thin Worker (new `worker/` dir: `wrangler.toml` + `src/worker.ts`)
- **Bindings:** KV namespace `SNAPSHOTS`; secret `PUBLISH_TOKEN`.
- **`POST /publish`:** constant-time compare `Authorization` vs `PUBLISH_TOKEN`; size-cap the body;
  validate JSON; write to KV key `snapshot:nate` (single key for MVP). `204` ok / `403` bad token.
- **`GET /state.json`, `/api/profile.json`, `/api/theme.json`:** serve the matching subfield from the
  stored snapshot. **`GET /` + `/live`:** serve the `public/live.html` template (Workers static asset).
  → maximal reuse: the existing client JS just works against these.
- **Edge cache:** `Cache-Control` (~30–60 s) on GET responses so Cloudflare serves most views from
  cache (keeps reads ~free; §5).
- **Deploy:** `wrangler deploy` → free `*.workers.dev` URL. Separate project dir — **no new deps in the
  main local package.**
- **Security:** only `POST /publish` is token-gated; all GETs are public read-only (the snapshot is
  already the public surface — no secrets). CORS: GET open, POST token-only.

### Component ④ — Custom domain (last-mile, optional for "done")
- Works on `*.workers.dev` with $0 and no domain. When `natebuilds.dev` is on Cloudflare, add the
  Worker custom domain `vibelog.natebuilds.dev` (one CNAME / dashboard route) → auto-SSL. No code change.

## 3. Build / PR order

1. **PR1 — Summarizer** (①). Self-contained; ships local value immediately (works offline, BYO/local/none).
2. **PR2 — Publisher** (②). Snapshot + throttle/dedup + config; testable against a local stub endpoint.
3. **PR3 — Worker** (③) deployed to `workers.dev`; point the publisher at it → **end-to-end MVP live**.
4. **PR4 — Custom domain** (④) when the domain's ready.

## 4. Verify plan

- Per PR: `pnpm exec tsc --noEmit` + `node --test --import tsx "src/*.test.ts"` + a screenshot.
- End-to-end (after PR3): run `vibe start` locally → confirm snapshot POSTs → load the `workers.dev`
  URL in a browser → see the live page → **stop the local agent** → reload → page still serves the last
  snapshot (proves the 24/7 claim).

## 5. Security checklist (must hold)

- Snapshot carries only the `buildShareData` public surface — re-audit the 3 leak surfaces (terminal,
  devtools network/console, the published JSON) after wiring the publisher.
- Publish token: `secrets.json` (chmod 600) locally + Worker secret in the cloud; never logged/committed.
- No new inbound local route; `PUBLIC_GET_ROUTES`/`isRemote()` unchanged.
- Worker GETs expose nothing beyond the public surface; `POST /publish` is the only write, token-gated.

## 6. Decisions to confirm (defaults chosen — override if you want)

1. **Summarizer default = `"auto"`** (local-if-running → Gemini-if-key → template). Matches "be flexible." ✅ recommend
2. **Storage = Cloudflare KV**, single key for MVP. ✅ recommend
3. **Cadence (MVP, hardcoded):** ~300 s live / ~900 s idle, write-on-change. ✅ recommend
4. **Subdomain label** (last step only): `vibelog.` / `live.` / `building.`? — Nathan's call.
5. **Do you already own `natebuilds.dev`?** (Only affects when ④ can happen; nothing before it.)

## 7. Explicitly NOT in V1 MVP (Phase 2+)

Multi-tenant keys · accounts/login/`@handle` · free `*.vibelog.app` slots · embed widget · custom
domains for others · Stripe/billing · cadence-as-enforced-paywall · Teams. See `PLATFORM_PLAN.md §7.2`.

## 8. Orchestration — parallel subagents + model tiers

The lead agent acts as **orchestrator**: freeze the shared contract, fan out independent work to
subagents (in **worktrees** to avoid collisions), then integrate + review.

### 8.1 Dependency graph
```
STEP 0 (orchestrator): freeze the SNAPSHOT CONTRACT = the { state, profile, theme } JSON
        (the public buildShareData surface + the shapes live.html already fetches).
        This is the only interface A/B/C share → once frozen they run in parallel.
                         │
        ┌────────────────┼────────────────┐
   TASK A (PR1)      TASK B (PR2)      TASK C (PR3)         ← parallel, separate worktrees
   summarizer        publisher         Worker + KV
   src/summarize.ts  src/publish.ts    worker/ (new dir)
                     + wire agent.ts    reuses live.html
        └────────────────┼────────────────┘
                         ▼
   INTEGRATE (orchestrator): point publisher → Worker URL, `wrangler deploy` to workers.dev,
        run the §4 end-to-end verify, then the §5 SECURITY REVIEW. → MVP live.
                         ▼
   PR4 custom domain — manual (Nathan + orchestrator), not a code subagent.
```

### 8.2 Parallelism & collision rules
- **A is fully isolated** (only `src/summarize.ts` + test + a `settings.json` field).
- **C is fully isolated** (new `worker/` dir; no main-package deps).
- **B is the only shared-file risk** — it adds `src/publish.ts` (isolated) but also a one-line wire-in
  to `src/agent.ts`. Keep that touch to a single call site; orchestrator merges B last and resolves any
  `agent.ts` overlap. → **A & C are safe to run truly in parallel; B merges carefully.**
- Each subagent: build in a worktree, `tsc --noEmit` + tests green, return a diff. Orchestrator reviews
  and merges in order A → C → B, then integrates.

### 8.3 Model tiers (the "affordable" ask — Opus + Sonnet)
| Work | Model | Why |
|---|---|---|
| Orchestration, **snapshot-contract design**, `agent.ts` integration, **security review** (§5) | **Opus** | cross-cutting + risky; get it right once |
| **Task A** summarizer, **Task B** publisher, **Task C** Worker — i.e. the bulk of the build | **Sonnet** | real but bounded feature work, guarded by tests — the default workhorse |

Rule of thumb: **Opus only where a wrong decision is expensive or shared; Sonnet for everything else**
(the contained, test-guarded features). *(Optional: Haiku for purely mechanical glue — `wrangler.toml`
scaffolding, doc/changelog edits.)* Escalate a task one tier if a subagent stalls or its tests won't go green.
