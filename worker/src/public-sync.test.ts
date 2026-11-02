/**
 * The Worker serves committed copies of the root public/ pages (see
 * worker/README.md). Drift means the 24/7 cloud /live behaves differently
 * from the local one, so fail loudly if a copy goes stale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(WORKER, "..");

for (const file of ["live.html", "embed.html", "embed.js", "landing.html"]) {
  test(`worker/public/${file} matches public/${file}`, () => {
    const src = readFileSync(path.join(ROOT, "public", file), "utf8");
    const copy = readFileSync(path.join(WORKER, "public", file), "utf8");
    assert.equal(copy, src, `run: cp public/${file} worker/public/${file}`);
  });
}
