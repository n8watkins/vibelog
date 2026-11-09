/**
 * Handler-level round-trip tests for the VibeLog Worker.
 *
 * Unlike worker.test.ts (pure helpers), these drive the actual exported
 * `fetch` handler with an in-memory KV stub + ASSETS stub, proving the heart
 * of the MVP locally without a Cloudflare runtime or a deploy: a token-gated
 * POST /publish stores the snapshot, and the three public GETs serve exactly
 * that snapshot back in the shape public/live.html expects (SNAPSHOT_CONTRACT).
 *
 * Run:
 *   node --test --import tsx worker/src/roundtrip.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.ts";
import { SNAPSHOT_KEY } from "./keys.ts";

const TOKEN = "test-publish-token-123";

/** Minimal in-memory KV stub (only get/put are used by the worker). */
function makeKV(): { get: (k: string) => Promise<string | null>; put: (k: string, v: string) => Promise<void>; _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
  };
}

/** Env with a fake ASSETS fetcher that returns a recognizable live.html body. */
function makeEnv(kv: ReturnType<typeof makeKV>) {
  return {
    SNAPSHOTS: kv,
    PUBLISH_TOKEN: TOKEN,
    ASSETS: {
      async fetch(req: Request) {
        return new Response(`<!doctype html><!-- ${new URL(req.url).pathname} -->`, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      },
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
}

const SNAPSHOT = {
  state: { isLive: true, stats: { features: 3, commits: 7 }, nowBuilding: { title: "Wiring the publisher" } },
  profile: { displayName: "Nate", bio: "building in public" },
  theme: { "--accent": "#0ff", "--bg": "#000" },
};

function post(env: ReturnType<typeof makeEnv>, body: string, token: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return worker.fetch(new Request("https://w.example/publish", { method: "POST", headers, body }), env);
}

describe("worker round-trip: publish then serve", () => {
  it("rejects a publish with a wrong token (403) and writes nothing", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    const res = await post(env, JSON.stringify(SNAPSHOT), "wrong-token");
    assert.equal(res.status, 403);
    assert.equal(kv._store.has(SNAPSHOT_KEY), false);
  });

  it("rejects a publish with no Authorization header (403)", async () => {
    const kv = makeKV();
    const res = await post(makeEnv(kv), JSON.stringify(SNAPSHOT), null);
    assert.equal(res.status, 403);
  });

  it("rejects a body missing a contract field (400)", async () => {
    const kv = makeKV();
    const res = await post(makeEnv(kv), JSON.stringify({ state: {}, profile: {} }), TOKEN);
    assert.equal(res.status, 400);
    assert.equal(kv._store.has(SNAPSHOT_KEY), false);
  });

  it("accepts a valid publish (204) and stores the snapshot under snapshot:nate", async () => {
    const kv = makeKV();
    const res = await post(makeEnv(kv), JSON.stringify(SNAPSHOT), TOKEN);
    assert.equal(res.status, 204);
    assert.deepEqual(JSON.parse(kv._store.get(SNAPSHOT_KEY)!), SNAPSHOT);
  });

  it("serves the stored snapshot back on the three public GET routes", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await post(env, JSON.stringify(SNAPSHOT), TOKEN);

    const state = await worker.fetch(new Request("https://w.example/state.json"), env);
    assert.equal(state.status, 200);
    assert.equal(state.headers.get("cache-control"), "public, max-age=30");
    assert.deepEqual(await state.json(), SNAPSHOT.state);

    const profile = await worker.fetch(new Request("https://w.example/api/profile.json"), env);
    assert.deepEqual(await profile.json(), { profile: SNAPSHOT.profile });

    // ?page= is ignored — always the "live" resolution (contract §2).
    const theme = await worker.fetch(new Request("https://w.example/api/theme.json?page=overlay"), env);
    assert.deepEqual(await theme.json(), { vars: SNAPSHOT.theme });
  });

  it("cold KV (nothing published yet) serves empty defaults, not 500", async () => {
    const env = makeEnv(makeKV());
    const state = await worker.fetch(new Request("https://w.example/state.json"), env);
    assert.equal(state.status, 200);
    assert.deepEqual(await state.json(), {});
    const profile = await worker.fetch(new Request("https://w.example/api/profile.json"), env);
    assert.deepEqual(await profile.json(), { profile: {} });
    const theme = await worker.fetch(new Request("https://w.example/api/theme.json"), env);
    assert.deepEqual(await theme.json(), { vars: {} });
  });

  it("redirects / to vibelogs.dev and serves live.html on /live", async () => {
    const env = makeEnv(makeKV());
    const home = await worker.fetch(new Request("https://w.example/"), env);
    assert.equal(home.status, 301);
    assert.equal(home.headers.get("location"), "https://vibelogs.dev/");

    // The ASSETS stub echoes the rewritten pathname, proving the route→file map.
    const res = await worker.fetch(new Request("https://w.example/live"), env);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /live\.html/);
    assert.equal(res.headers.get("cache-control"), "public, max-age=30");
  });

  it("strips dollar spend from /state.json even if an agent published it", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    const costly = { ...SNAPSHOT, state: { ...SNAPSHOT.state, stats: { features: 3, costUsd: 0.3267, claudeTokens: 9000 } } };
    await post(env, JSON.stringify(costly), TOKEN);
    const state = (await (await worker.fetch(new Request("https://w.example/state.json"), env)).json()) as { stats: Record<string, unknown> };
    assert.equal("costUsd" in state.stats, false);
    assert.equal(state.stats.claudeTokens, 9000);

    // The Worker owner can opt in explicitly.
    const optIn = { ...env, PUBLIC_SHOW_COST: "true" } as typeof env;
    const shown = (await (await worker.fetch(new Request("https://w.example/state.json"), optIn)).json()) as { stats: Record<string, unknown> };
    assert.equal(shown.stats.costUsd, 0.3267);
  });

  it("answers HEAD like GET with no body, and stamps security headers", async () => {
    const env = makeEnv(makeKV());
    const head = await worker.fetch(new Request("https://w.example/state.json", { method: "HEAD" }), env);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    for (const p of ["/state.json", "/live", "/nope"]) {
      const r = await worker.fetch(new Request("https://w.example" + p), env);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff", p);
      assert.equal(r.headers.get("x-frame-options"), "DENY", p);
      assert.match(r.headers.get("strict-transport-security") ?? "", /max-age=/, p);
    }
    // The embed widget must stay framable on the streamer's own site.
    const embed = await worker.fetch(new Request("https://w.example/embed"), env);
    assert.equal(embed.headers.get("x-frame-options"), null);
  });

  it("serves embed.html on /embed via the assets binding", async () => {
    const env = makeEnv(makeKV());
    const res = await worker.fetch(new Request("https://w.example/embed"), env);
    assert.equal(res.status, 200);
    const body = await res.text();
    // The ASSETS stub echoes the rewritten pathname — proves /embed → /embed.html.
    assert.match(body, /embed\.html/);
    assert.equal(res.headers.get("cache-control"), "public, max-age=30");
  });

  it("a later publish overwrites the stored snapshot", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    await post(env, JSON.stringify(SNAPSHOT), TOKEN);
    const next = { ...SNAPSHOT, state: { ...SNAPSHOT.state, stats: { features: 9, commits: 12 } } };
    const res = await post(env, JSON.stringify(next), TOKEN);
    assert.equal(res.status, 204);
    const state = await worker.fetch(new Request("https://w.example/state.json"), env);
    assert.deepEqual(await state.json(), next.state);
  });
});

describe("edge cache: repeated GETs are served without re-reading KV", () => {
  // Stub the Workers `caches.default` (absent under plain Node) with an in-memory
  // Cache keyed on the normalised URL, matching what cachedJson() does.
  function withCachesStub(fn: () => Promise<void>): () => Promise<void> {
    return async () => {
      const store = new Map<string, Response>();
      (globalThis as { caches?: unknown }).caches = {
        default: {
          async match(req: Request) {
            const r = store.get(new URL(req.url).toString());
            return r ? r.clone() : undefined;
          },
          async put(req: Request, res: Response) {
            store.set(new URL(req.url).toString(), res.clone());
          },
        },
      };
      try {
        await fn();
      } finally {
        delete (globalThis as { caches?: unknown }).caches;
      }
    };
  }

  it(
    "second /state.json poll hits the edge cache, not KV",
    withCachesStub(async () => {
      const kv = makeKV();
      let gets = 0;
      const counting = { ...kv, get: async (k: string) => { gets++; return kv.get(k); } };
      const env = makeEnv(counting as unknown as ReturnType<typeof makeKV>);
      await post(env, JSON.stringify(SNAPSHOT), TOKEN);

      const r1 = await worker.fetch(new Request("https://w.example/state.json"), env);
      assert.deepEqual(await r1.json(), SNAPSHOT.state);
      assert.equal(gets, 1, "first GET reads KV (cache miss)");

      const r2 = await worker.fetch(new Request("https://w.example/state.json"), env);
      assert.deepEqual(await r2.json(), SNAPSHOT.state);
      assert.equal(gets, 1, "second GET served from edge cache — no extra KV read");

      // A different JSON route is a different cache key → its own KV read.
      await worker.fetch(new Request("https://w.example/api/profile.json"), env);
      assert.equal(gets, 2, "profile route is a separate cache key");
    })
  );

  it(
    "?page= variants of /api/theme.json share one cache entry",
    withCachesStub(async () => {
      const kv = makeKV();
      let gets = 0;
      const counting = { ...kv, get: async (k: string) => { gets++; return kv.get(k); } };
      const env = makeEnv(counting as unknown as ReturnType<typeof makeKV>);
      await post(env, JSON.stringify(SNAPSHOT), TOKEN);

      await worker.fetch(new Request("https://w.example/api/theme.json?page=live"), env);
      const r = await worker.fetch(new Request("https://w.example/api/theme.json?page=overlay"), env);
      assert.deepEqual(await r.json(), { vars: SNAPSHOT.theme });
      assert.equal(gets, 1, "query is dropped from the cache key, so both share one entry");
    })
  );
});
