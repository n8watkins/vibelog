/**
 * End-to-end: the browser attacks from the 2026-11-09 assessment, replayed
 * against the real `vibe demo` agent (throwaway HOME). Each one used to
 * succeed; now each must fail safely while the agent's own callers keep working.
 *
 *  1. A page on evil.example POSTs text/plain JSON to /building and puts its
 *     text on the stream HUD (a CORS "simple" request, no preflight).
 *  2. A page on evil.example reads /api/dashboard.json cross-origin (CORS *).
 *  3. DNS rebinding: Host: rebind.evil.example reaches the private dashboard.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let home = "";
let port = 0;
let child: ChildProcess | null = null;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const p = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(p));
    });
  });
}

type Res = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

/** Raw HTTP so the test controls every header a browser would send (incl. Host). */
function call(method: string, pathname: string, headers: Record<string, string> = {}, body?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function waitForServer(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await call("GET", "/state.json")).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("demo agent did not start");
}

const nowBuilding = async () =>
  (JSON.parse((await call("GET", "/state.json")).body) as { nowBuilding?: { title?: string } }).nowBuilding?.title;

before(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "vibelog-sec-"));
  port = await freePort();
  child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "demo", "--port", String(port)], {
    cwd: ROOT,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    stdio: "ignore",
  });
  await waitForServer();
});

after(async () => {
  child?.kill("SIGKILL");
  await rm(home, { recursive: true, force: true });
});

const INJECT = JSON.stringify({ title: "INJECTED BY A WEBSITE", mode: "coding" });

test("exploit 1: a text/plain POST from evil.example cannot write to the HUD", async () => {
  const r = await call("POST", "/building", {
    origin: "https://evil.example",
    "content-type": "text/plain",
    "sec-fetch-site": "cross-site",
  }, INJECT);
  assert.equal(r.status, 415);
  assert.notEqual(await nowBuilding(), "INJECTED BY A WEBSITE");
});

test("exploit 1b: the same write as JSON from a foreign origin is refused too", async () => {
  for (const route of ["/building", "/mark", "/end", "/api/settings", "/hooks/claude/prompt", "/api/oauth/twitch/disconnect"]) {
    const r = await call("POST", route, {
      origin: "https://evil.example",
      "content-type": "application/json",
    }, INJECT);
    assert.equal(r.status, 403, route);
  }
  assert.notEqual(await nowBuilding(), "INJECTED BY A WEBSITE");
});

test("exploit 2: /api/dashboard.json and /api/settings.json carry no CORS header", async () => {
  for (const route of ["/api/dashboard.json", "/api/settings.json", "/dashboard"]) {
    const r = await call("GET", route, { origin: "https://evil.example" });
    assert.equal(r.headers["access-control-allow-origin"], undefined, route);
  }
});

test("public read-only routes still allow cross-origin reads", async () => {
  for (const route of ["/state.json", "/api/theme.json", "/api/profile.json"]) {
    const r = await call("GET", route, { origin: "https://evil.example" });
    assert.equal(r.status, 200, route);
    assert.equal(r.headers["access-control-allow-origin"], "*", route);
  }
});

test("exploit 3: a DNS-rebinding Host cannot reach private routes", async () => {
  const host = { host: `rebind.evil.example:${port}` };
  for (const route of ["/dashboard", "/api/dashboard.json", "/api/settings.json"]) {
    assert.equal((await call("GET", route, host)).status, 403, route);
  }
  const w = await call("POST", "/building", { ...host, "content-type": "application/json" }, INJECT);
  assert.equal(w.status, 403);
  // The public HUD data stays readable under any name, like over a tunnel,
  // and never includes dollar spend.
  const s = await call("GET", "/state.json?hud=1", host);
  assert.equal(s.status, 200);
  assert.equal("costUsd" in (JSON.parse(s.body) as { stats: object }).stats, false);
});

test("the agent's own callers still work: CLI/hook JSON and the dashboard's same-origin save", async () => {
  const cli = await call("POST", "/building", { "content-type": "application/json" }, JSON.stringify({ title: "From the CLI" }));
  assert.equal(cli.status, 200);
  assert.equal(await nowBuilding(), "From the CLI");

  const hook = await call("POST", "/hooks/claude/tool", { "content-type": "application/json" }, JSON.stringify({ tool_name: "Edit" }));
  assert.equal(hook.status, 200);

  const dash = await call("POST", "/api/settings", {
    host: `localhost:${port}`,
    origin: `http://localhost:${port}`,
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
  }, JSON.stringify({ profile: { displayName: "Owner" } }));
  assert.equal(dash.status, 200);

  const page = await call("GET", "/dashboard", { host: `localhost:${port}` });
  assert.equal(page.status, 200);
});

test("an oversized body is refused", async () => {
  const r = await call("POST", "/mark", { "content-type": "application/json" }, JSON.stringify({ kind: "note", text: "x".repeat(300_000) }));
  assert.equal(r.status, 413);
});
