# VibeLog — Snapshot Contract (FROZEN)

`docs/SNAPSHOT_CONTRACT.md` — status: **frozen** · 2026-06-11 (orchestrator, STEP 0 of MVP_PLAN §8)

> The single interface that the **publisher** (PR2), the **Worker** (PR3), and the existing
> `public/live.html` client all share. Freezing it lets Tasks A/B/C proceed without re-negotiating
> shapes. **Do not widen this** — it is exactly the already-public `buildShareData`-era surface that
> `/live` fetches today. No prompts, paths, diffs, tokens, or keys ever appear here (CLAUDE.md invariant).

## 1. What `public/live.html` fetches today (the source of truth)

The public live page makes exactly three GETs (verified in `public/live.html`):

| Request | Response body | Server source |
|---|---|---|
| `GET /state.json` | the full `LiveState` object | `src/state.ts` → `state` (already redacted + capped) |
| `GET /api/profile.json` | `{ profile: SanitizedProfile }` | `sanitizeProfile(settings.profile)` — 4 fields |
| `GET /api/theme.json?page=live` | `{ vars: ThemeVars }` | `resolveTheme(settings, "live")` — allowlisted CSS vars |

`SanitizedProfile` = the four user-typed fields only: `{ displayName, twitter, channelHeader, bio }`
(`sanitizeProfile` in `src/theme.ts`). `ThemeVars` = the allowlist-validated CSS custom-property map
(`validateVars` in `src/theme.ts`). `LiveState` is `src/state.ts`'s contract — every string in it has
already passed `redact()` + the 140-char cap before it was stored.

## 2. The snapshot object (the wire format publisher ⇄ Worker)

```ts
// The published JSON. One object, three fields = the three responses above.
type Snapshot = {
  state:   LiveState;        // === GET /state.json body
  profile: SanitizedProfile; // === GET /api/profile.json `.profile`
  theme:   ThemeVars;        // === GET /api/theme.json?page=live `.vars` (resolved for the "live" page)
};
```

- **Publisher (PR2)** builds this by reading the same sources the three routes use: the in-memory
  `state`, `sanitizeProfile(settings?.profile)`, and `resolveTheme(settings, "live")`. It MUST NOT add
  any field outside this shape. (It may also be convenient to expose a single `buildSnapshot()` helper in
  the agent that returns this object; keep it to these three keys.)
- **Worker (PR3)** stores this object under one KV key (`snapshot:nate`) and serves it back so the
  **unchanged** `live.html` client works against the cloud:

| Worker route | Returns | From snapshot |
|---|---|---|
| `GET /state.json` | `snapshot.state` (verbatim) | `.state` |
| `GET /api/profile.json` | `{ profile: snapshot.profile }` | `.profile` |
| `GET /api/theme.json` (any `?page=`) | `{ vars: snapshot.theme }` | `.theme` (MVP serves the "live" resolution regardless of `page`) |
| `GET /` and `GET /live` | the `public/live.html` template (static asset) | — |
| `POST /publish` | `204`/`403` — token-gated write of a `Snapshot` to KV | (the only write) |

## 3. Invariants (must hold for all three tasks)

- The snapshot carries **only** §2's three fields. Re-audit the 3 leak surfaces (terminal, devtools
  network/console, the published JSON) after wiring the publisher (MVP_PLAN §5).
- The publish is **outbound only** from the local agent — it adds **no inbound local route**, so
  `isRemote()` / `PUBLIC_GET_ROUTES` in `src/agent.ts` are untouched.
- The Worker's only write is `POST /publish` (token-gated, constant-time compare). Every Worker GET is
  public read-only and exposes nothing beyond this already-public surface.
- Wire shape is **append-never** for V1: if a future field is needed, version the snapshot rather than
  silently widening it (keeps Phase-2 multi-tenant migration clean).
