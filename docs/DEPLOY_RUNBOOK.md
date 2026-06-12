# VibeLog — Deploy Runbook (pre-flighted 2026-06-12)

The code is complete and committed through G4 (embed widget). This is the exact,
paste-ready sequence to take `vibelog-live` from "never deployed" to "live 24/7 on
`vibelog.n8builds.dev`". Pre-flight already done (see bottom). Budget ~5–10 min.

> **⚠️ STREAMING SAFETY.** Steps that touch the **publish token** (Step 4) generate and
> handle a secret. Do them **while NOT live on stream.** The commands below are written
> to never echo the token to the terminal — don't "improve" them by printing `$TOKEN`.

---

## What you (Nathan) must run interactively
Only two steps need a human: `wrangler login` (opens a browser) and the token step
(Step 4). Run them yourself with `! <command>` in this session so output lands here.
Everything else I can run for you.

---

## Step 1 — Log in to Cloudflare *(interactive — you)*
```bash
cd /home/natkins/n8builds/projects/vibelog/worker
npx wrangler login
```
Opens a browser; authorize. (Create the free Cloudflare account first if you haven't.)

Verify:
```bash
npx wrangler whoami
```

## Step 2 — Create the KV namespaces
```bash
cd /home/natkins/n8builds/projects/vibelog/worker
npx wrangler kv namespace create SNAPSHOTS
npx wrangler kv namespace create SNAPSHOTS --preview
```
Each prints an `id`. Paste both back to me and **I'll edit `worker/wrangler.toml`**
(replace `REPLACE_WITH_KV_NAMESPACE_ID` with the prod `id`, and add `preview_id`).
Then I'll commit that change.

## Step 3 — Deploy the Worker
```bash
cd /home/natkins/n8builds/projects/vibelog/worker
npx wrangler deploy
```
Prints the URL, e.g. `https://vibelog-live.<account>.workers.dev`. Note it — call it
`$WORKER_URL` below.

## Step 4 — Set the publish token *(off-stream — you)*
This generates a random token, stores it as a Worker secret, **and** writes it into
`~/.vibelog/secrets.json` — all without printing it. Replace `$WORKER_URL` with the URL
from Step 3 first.
```bash
cd /home/natkins/n8builds/projects/vibelog/worker

# 1. Generate the token into a shell var (NOT printed).
TOKEN=$(openssl rand -hex 32)

# 2. Store it as the Worker secret (reads stdin, no echo).
printf '%s' "$TOKEN" | npx wrangler secret put PUBLISH_TOKEN

# 3. Write url + the SAME token into secrets.json (no echo; jq is available).
WORKER_URL="https://vibelog-live.<account>.workers.dev"   # <-- paste real URL
jq --arg t "$TOKEN" --arg u "$WORKER_URL/publish" \
   '.publish.url=$u | .publish.token=$t' \
   ~/.vibelog/secrets.json > ~/.vibelog/secrets.json.tmp \
  && mv ~/.vibelog/secrets.json.tmp ~/.vibelog/secrets.json \
  && chmod 600 ~/.vibelog/secrets.json

# 4. Clear the var.
unset TOKEN
```
> Note the **`/publish`** suffix on the URL — `src/agent.ts:835` POSTs to `secrets.publish.url`
> verbatim, so it must be the full publish endpoint, not the bare origin.

## Step 5 — Prove the 24/7 claim
```bash
# Restart the agent so it picks up the new secrets.
vibe start
```
Then:
1. Open `$WORKER_URL` in a browser → the `/live` page renders from the published snapshot.
2. **Stop the agent** (Ctrl-C).
3. Reload `$WORKER_URL` → page still serves the last snapshot. ✅ That's the whole point:
   profile stays up with your machine off.

## Step 6 — PR4: custom domain `vibelog.n8builds.dev` *(unblocked — domain is registered)*
1. In the Cloudflare dashboard, ensure `n8builds.dev` is added as a zone (nameservers
   pointed at Cloudflare). If you registered it through Cloudflare Registrar it's already a zone.
2. Worker → `vibelog-live` → **Settings → Domains & Routes → Add → Custom Domain** →
   `vibelog.n8builds.dev`. Cloudflare provisions the DNS record + SSL automatically (~1 min).
3. Re-point `secrets.publish.url` to the custom domain (optional but tidy):
   ```bash
   jq '.publish.url="https://vibelog.n8builds.dev/publish"' \
      ~/.vibelog/secrets.json > ~/.vibelog/secrets.json.tmp \
     && mv ~/.vibelog/secrets.json.tmp ~/.vibelog/secrets.json \
     && chmod 600 ~/.vibelog/secrets.json
   ```
   Restart `vibe start`. The `/embed.js` loader derives its own origin at runtime, so the
   embed snippet on your site keeps working on the custom domain with no change.

---

## Pre-flight results (2026-06-12 — all green)
- ✅ `worker/public/{live.html,embed.html,embed.js}` **in sync** with root `public/`.
- ✅ Root: typecheck clean, **100/100 tests pass**.
- ✅ Worker: **38/38 tests pass** (`node --test --import tsx "worker/src/*.test.ts"`).
- ✅ `worker/node_modules` already installed — **skip `npm install`**.
- ✅ `wrangler` (in `worker/`) and `jq` both available on this box.
- ✅ `secrets.json` already has a `publish` block scaffold (`secrets.example.json:18`).

## If you change `public/` before deploying
Re-copy the three files into the Worker and re-deploy:
```bash
cp public/live.html  worker/public/live.html
cp public/embed.html worker/public/embed.html
cp public/embed.js   worker/public/embed.js
```
