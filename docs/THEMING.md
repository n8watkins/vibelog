# VibeLog — Theming & Settings Spec

`docs/THEMING.md` — status: **ready to build (Phase 1 approved-pending)**

Covers roadmap items **T1–T5** and **S1** from `docs/VISION.md`. The moving gradient, the theme
engine, and the settings persistence all share one mechanism: **a theme is a JSON object of CSS
custom-property values**, applied at runtime on `document.documentElement.style`, read from a
localhost-written / publicly-readable `~/.vibelog/settings.json`.

---

## A. The moving-gradient bug and the fix (T1, T2)

### Why every card looks 100% synced today

The ring is one global keyframe animating one registered property:

```css
@property --vlangle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
@keyframes vlspin { to { --vlangle: 360deg; } }
.card::after { background: conic-gradient(from var(--vlangle), …); animation: vlspin 8s linear infinite; }
```

Three root causes:

1. **Same colors, same order on every card** — identical conic stop list reading the same
   `--accent/--pink/--accent2`, so the hue passing each corner is identical everywhere.
2. **Same start angle / same corner** — every ring uses `from var(--vlangle)` with the same stop
   offsets, so at `0deg` every bright band sits at the same corner.
3. **Weak/fast desync** — only one card has a negative `animation-delay`; durations (7/8/9/11s) are
   fast and near-harmonic so they visibly beat back into sync. `live.html`'s `.glass::after` has no
   per-element overrides at all (perfectly locked); `dashboard.html` has no ring yet.

### The fix — desync along four independent axes (pure CSS, OBS-Chromium-safe)

Keep the `@property` + masked-conic mechanism. Per card, vary:

1. **Start angle (different corner)** — compose a per-card offset into the conic:
   `conic-gradient(from calc(var(--vlangle) + var(--vlstart, 0deg)), …)`, with
   `--vlstart: 0deg / 120deg / 240deg / 300deg`.
2. **Hue (different colors)** — `filter: hue-rotate(var(--vlhue, 0deg))` on the `::after` ring only
   (never the card, so content/text is untouched), `--vlhue: 0deg / 45deg / -40deg / 90deg`. Keeps
   the palette coherent while making each ring a different color family, and composes with whatever
   theme is active.
3. **Phase** — large negative `animation-delay` (`0s / -7s / -15s / -21s`) so there's no load-time
   sync and no realign beat.
4. **Speed** — slower, pairwise near-coprime durations (e.g. `23s / 29s / 31s / 37s`).

Illustrative rule shape:

```css
.card::after {
  background: conic-gradient(from calc(var(--vlangle) + var(--vlstart,0deg)),
    transparent 30%, var(--g1) 48%, var(--g2) 62%, var(--g3) 76%, transparent 92%);
  filter: hue-rotate(var(--vlhue,0deg));
  animation: vlspin var(--vldur,24s) linear infinite;
  animation-delay: var(--vldelay,0s);
}
.card:nth-of-type(1)::after { --vlstart:0deg;   --vlhue:0deg;   --vldur:23s; --vldelay:0s;  }
.card:nth-of-type(2)::after { --vlstart:120deg; --vlhue:45deg;  --vldur:29s; --vldelay:-7s; }
.card:nth-of-type(3)::after { --vlstart:240deg; --vlhue:-40deg; --vldur:31s; --vldelay:-15s;}
```

Apply to: `overlay.html` `.card::after` (replace the weak overrides), `live.html` `.glass::after`
(add nth-of-type variants), and **add** the `@property` + `@keyframes` + `.panel::after` ring to
`dashboard.html` (its `.panel` already has `overflow:hidden` + `border-radius`, so the masked ring
clips correctly).

New `--g1/--g2/--g3` gradient-stop vars default to `--accent/--pink/--accent2`, so this is purely
visual and looks identical until a theme is applied.

---

## B. Theme data model (T3, T4)

A theme = a flat object of CSS-var values. The schema is the union of vars all three pages read,
plus the new gradient stops:

```
ThemeVars keys:
  --bg --text --muted                 // base
  --accent --accent2 --pink           // neon accents
  --g1 --g2 --g3                       // gradient ring stops (default to the accents)
  --glass --border --glow             // surfaces
  --aurora1 --aurora2                  // background aurora blobs
  --l0 --l1 --l2 --l3 --l4            // dashboard heatmap ramp
```

Two structural prerequisites so a theme is *total* (re-skins everything):
- Replace hardcoded `body { background:#07060e }` with `var(--bg, #07060e)` in all three pages.
- Promote the dashboard heatmap `--l0..--l4` and aurora colors (`#3a1d7a`, `#0f3a44`) to vars
  (keep current values as defaults so unthemed pages are pixel-identical to today).

A theme is `{ id, name, vars }`. Server-side type lives in a new `src/theme.ts` with a
**`THEME_VAR_KEYS` allowlist** — the security boundary. On write, the server strips any key not in
the allowlist and validates each value against a strict CSS-color/gradient regex (no `;`, no `}`,
no `url(`, length-capped) so a custom palette can never inject CSS or an exfil vector into
overlay-bound pages.

### Sample presets (neon-purple-glass family)

**Aurora Purple** (today's exact look — the default):
`--bg:#07060e --accent:#a06bff --accent2:#22d3a6 --pink:#ff5cf0 --g1:#a06bff --g2:#ff5cf0 --g3:#22d3a6 …`

**Cyber Mint** (teal/cyan): `--bg:#04100f --accent:#2ee6c0 --accent2:#3aa0ff --pink:#5cffd6 …`

**Sunset Ember** (warm magenta/orange): `--bg:#100610 --accent:#ff7a3d --accent2:#ff4d8d --pink:#ffb24d …`

Ship ~10 (add Vaporwave, Matrix Green, Ice Blue, Crimson, Gold Noir, Synthwave, Mono Slate).
**Randomize** = pick a random preset from this curated list — never arbitrary RGB.

---

## C. Persistence, routes, runtime apply (S1, T5)

### `~/.vibelog/settings.json` (new)

```
type Settings = {
  version: 1;
  theme: {
    sync: boolean;                 // one theme across all pages?
    shared: ThemeVars;             // used when sync = true
    perPage?: { overlay?: ThemeVars; live?: ThemeVars; dashboard?: ThemeVars };  // sync = false
    presetId?: string;             // last-picked preset (UI highlight)
  };
  // structure stubbed now, UI later (S2/S3):
  profile?: { displayName?; bio?; twitter?; channelHeader? };
  integrations?: {
    twitch?: { connected: boolean; login? };
    youtube?: { connected: boolean; channelId? };
    discord?: { connected: boolean };
    github?: { connected: boolean; login? };
  };
};
```

**Secrets never go here** — OAuth tokens/client secrets stay in `secrets.json`.
`integrations.*.connected` is *derived* from secrets presence, never the token itself. Only the
`theme` sub-tree is ever public-readable.

Add `SETTINGS_FILE` to `src/config.ts`; `readSettings`/`writeSettings` to `src/store.ts` (reuse
existing `readJson`/`writeJson`).

### New HTTP routes (`src/agent.ts`)

1. **`GET /api/theme.json?page=overlay|live|dashboard` — PUBLIC.** Add to `PUBLIC_GET_ROUTES`
   (overlay in OBS reads it with no auth). Resolves: `sync` → `shared`, else `perPage[page] ?? shared
   ?? default`. Falls back to the Aurora Purple default if `settings.json` is absent (zero-config
   still looks right). Returns **only** `{ vars }` (allowlist-validated) — never profile/integrations/
   secrets.
2. **`POST /api/settings` — LOCALHOST ONLY.** A POST not in `PUBLIC_GET_ROUTES`, so the existing
   `isRemote()` gate already 403s any tunneled/LAN caller — no new gating logic. Deep-merges a
   partial patch, validates theme vars against the allowlist + regex, writes, echoes back the theme
   sub-tree (no secrets).
3. **(Phase 4) `GET /api/settings.json` — LOCALHOST ONLY** for the dashboard to load full profile/
   integration state.

### Runtime apply (all three pages)

A tiny `applyTheme(page)` in each page's head, run before first paint:

```js
async function applyTheme(page){
  try{
    const {vars} = await (await fetch(`/api/theme.json?page=${page}`,{cache:"no-store"})).json();
    const r = document.documentElement.style;
    for(const [k,v] of Object.entries(vars)) r.setProperty(k,v);
  }catch{ /* keep CSS :root defaults */ }
}
```

Because applying = setting CSS vars on `:root`, and every surface (including the rings via
`--g1/--g2/--g3`) reads those vars, one fetch re-skins the whole page. Overlay re-fetches every ~10s
(no shared localStorage with OBS, so server-side settings.json is the only sync channel — exactly
why this is server-first). Dashboard writes via `POST /api/settings` then re-applies locally for
instant feedback.

---

## D. Phases

- **Phase 1 — Gradient fix + var groundwork (no server changes).** 4-axis desync on overlay/live +
  add ring to dashboard; introduce `--g1/--g2/--g3`; `#07060e` → `var(--bg)`; promote aurora +
  heatmap to vars; ship `public/themes.js` (presets + `applyTheme`), selectable via `?theme=id` for
  testing. **Smallest shippable unit.**
- **Phase 2 — Persistence + routes.** `SETTINGS_FILE`, `readSettings`/`writeSettings`, `src/theme.ts`
  (allowlist + validator + `resolveTheme`), `GET /api/theme.json` (public), `POST /api/settings`
  (localhost), wire `applyTheme` into all pages. Tests in `src/agent.test.ts`: theme route allowed
  for remote, settings POST 403 for remote / 200 for localhost, allowlist strips injection.
- **Phase 3 — Dashboard Settings UI.** Preset grid, Randomize, custom-color inputs, sync toggle,
  live preview.
- **Phase 4 — Profile + Integrations** (`profile`/`integrations` sub-trees, `GET /api/settings.json`).

---

## E. Smallest first PR

**"Desync the travelling gradient + extend it to the dashboard, behind CSS variables."**
1. Rewrite per-card ring rules in `overlay.html` and `live.html` with the 4-axis desync.
2. Add `@property --vlangle` + `@keyframes vlspin` + `.panel::after` ring to `dashboard.html`.
3. Add `--g1/--g2/--g3` (defaulted to accents) and swap `#07060e` → `var(--bg,#07060e)` in all three.

Pure CSS, three static files, no server/security surface touched, immediately visible in OBS +
dashboard + /live, and lays the exact variable groundwork Phase 2 builds on.

---

### Critical files
- `public/overlay.html` — `@property` + `.card::after` ring + weak per-card overrides to replace
- `public/live.html` — single locked `.glass::after` ring to desync
- `public/dashboard.html` — needs the ring added + `applyTheme` hook
- `src/agent.ts` — `PUBLIC_GET_ROUTES`, the `isRemote()` gate, route handlers
- `src/config.ts` / `src/store.ts` / new `src/theme.ts` — settings persistence + allowlist/validator
