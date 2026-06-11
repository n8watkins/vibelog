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
import worker, { SNAPSHOT_KEY } from "./worker.ts";

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

  it("serves live.html on / and /live via the assets binding", async () => {
    const env = makeEnv(makeKV());
    for (const p of ["/", "/live"]) {
      const res = await worker.fetch(new Request("https://w.example" + p), env);
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.match(body, /live\.html/);
      assert.equal(res.headers.get("cache-control"), "public, max-age=30");
    }
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
