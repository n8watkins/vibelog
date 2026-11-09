/**
 * The Worker serves copies of root public/ pages, made by
 * scripts/sync-worker-public.mjs. Drift means the 24/7 cloud /live behaves
 * differently from the local one (it shipped a stale page from June to
 * November 2026), so fail loudly if a copy is stale or a stray file appears.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error - plain .mjs script without type declarations
import { drift } from "../../scripts/sync-worker-public.mjs";

test("worker/public matches public/ (run: node scripts/sync-worker-public.mjs)", () => {
  assert.deepEqual(drift(), []);
});
