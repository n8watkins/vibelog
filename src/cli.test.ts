/**
 * End-to-end checks of the `vibe` CLI, the agent and the Claude Code hook
 * script, each run as a real process with a throwaway HOME. Covers the phase 0
 * fixes: B4 (sub-agents counted), B5 (stale session.json), B7 (version, color,
 * wording), B8 (no prompt text in the event log) and `hooks install --global`.
 * Every prompt here is a synthetic canary, never real transcript text.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const homes: string[] = [];
const children: ChildProcess[] = [];

after(async () => {
  for (const c of children) c.kill("SIGKILL");
  for (const h of homes) await rm(h, { recursive: true, force: true });
});

async function tempHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "vibelog-cli-"));
  homes.push(home);
  return home;
}

type Run = { code: number; stdout: string; stderr: string };

function run(file: string, args: string[], home: string, opts: { input?: string; env?: Record<string, string> } = {}): Promise<Run> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [...(file.endsWith(".ts") ? ["--import", "tsx"] : []), file, ...args],
      { cwd: ROOT, env: { ...process.env, HOME: home, USERPROFILE: home, ...opts.env }, timeout: 30_000 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
    child.stdin?.end(opts.input ?? "");
  });
}

const vibe = (args: string[], home: string, env?: Record<string, string>) => run("src/cli.ts", args, home, { env });

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

/** The pid of a process that has already exited. */
function deadPid(): Promise<number> {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    c.on("exit", () => resolve(c.pid!));
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeSessionFile(home: string, session: Record<string, unknown>): Promise<string> {
  const dir = path.join(home, ".vibelog");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "session.json");
  await writeFile(file, JSON.stringify({ cwd: home, startedAt: new Date().toISOString(), ...session }));
  return file;
}

// ---- B7: small CLI defects -------------------------------------------------

test("--version prints the package.json version", async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")) as { version: string };
  const out = await vibe(["--version"], await tempHome());
  assert.equal(out.stdout.trim(), pkg.version);
});

test("chart prints no ANSI escapes when stdout is not a terminal", async () => {
  const out = await vibe(["chart", "--days", "7"], await tempHome());
  assert.equal(out.code, 0);
  assert.doesNotMatch(out.stdout, /\x1b\[/);
});

test("report yesterday says yesterday when nothing was logged", async () => {
  const out = await vibe(["report", "yesterday"], await tempHome());
  assert.match(out.stdout, /No activity logged yesterday\./);
  assert.doesNotMatch(out.stdout, /logged today/);
});

// ---- hooks install --global ----------------------------------------------

test("hooks install --global prints the block and never writes ~/.claude/settings.json", async () => {
  const home = await tempHome();
  const out = await vibe(["hooks", "install", "--global"], home);
  assert.equal(out.code, 0);
  assert.equal(await exists(path.join(home, ".claude", "settings.json")), false);
  const json = out.stdout.slice(out.stdout.indexOf("{"), out.stdout.lastIndexOf("}") + 1);
  const block = JSON.parse(json) as { hooks: Record<string, unknown> };
  assert.ok(block.hooks.UserPromptSubmit && block.hooks.PostToolUse && block.hooks.Stop);
  assert.match(out.stdout, /~\/\.claude\/settings\.json/);
});

// ---- B5: stale session.json ------------------------------------------------

test("status treats a session whose agent pid is dead as no session", async () => {
  const home = await tempHome();
  await writeSessionFile(home, { port: await freePort(), pid: await deadPid() });
  const out = await vibe(["status"], home);
  assert.match(out.stdout, /No active session\./);
});

test("end clears a stale session.json whose agent is gone", async () => {
  const home = await tempHome();
  const file = await writeSessionFile(home, { port: await freePort(), pid: await deadPid() });
  const out = await vibe(["end"], home);
  assert.equal(out.code, 0);
  assert.equal(await exists(file), false);
});

/** A loopback server that records the paths the hook script posts to. */
async function hookSink(): Promise<{ port: number; hits: string[]; close: () => void }> {
  const hits: string[] = [];
  const srv = createHttpServer((req, res) => {
    hits.push(req.url ?? "");
    req.resume();
    res.end("{}");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const addr = srv.address();
  return { port: typeof addr === "object" && addr ? addr.port : 0, hits, close: () => srv.close() };
}

test("the Claude hook does not forward when the session's agent pid is dead", async () => {
  const sink = await hookSink();
  try {
    const home = await tempHome();
    await writeSessionFile(home, { port: sink.port, pid: await deadPid() });
    const out = await run("hooks/claude-hook.mjs", ["tool"], home, { input: JSON.stringify({ tool_name: "Edit" }) });
    assert.equal(out.code, 0);
    assert.equal(out.stdout, "");
    assert.deepEqual(sink.hits, []);

    // Control: the same file with a live pid is forwarded.
    await writeSessionFile(home, { port: sink.port, pid: process.pid });
    await run("hooks/claude-hook.mjs", ["tool"], home, { input: JSON.stringify({ tool_name: "Edit" }) });
    assert.deepEqual(sink.hits, ["/hooks/claude/tool"]);
  } finally {
    sink.close();
  }
});

// ---- a real session: B4, B8 and end ---------------------------------------

async function post(port: number, pathname: string, body: unknown): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timed out");
}

test("a live session counts Agent and Task sub-agents, keeps prompt text out of the event log, and end removes session.json", async () => {
  const home = await tempHome();
  const repo = path.join(home, "repo");
  await mkdir(repo);
  await new Promise<void>((resolve, reject) =>
    execFile("git", ["init", "-q", repo], (err) => (err ? reject(err) : resolve())),
  );
  const port = await freePort();
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const agent = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "start", "--cwd", repo, "--port", String(port)], {
    cwd: ROOT,
    env,
    stdio: "ignore",
  });
  children.push(agent);
  const exited = new Promise<void>((r) => agent.on("exit", () => r()));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/state.json`)).ok);

  const sessionFile = path.join(home, ".vibelog", "session.json");
  const session = JSON.parse(await readFile(sessionFile, "utf8")) as { pid?: number };
  assert.equal(session.pid, agent.pid);

  // B4: both sub-agent tool names count.
  assert.equal(await post(port, "/hooks/claude/tool", { tool_name: "Agent" }), 200);
  assert.equal(await post(port, "/hooks/claude/tool", { tool_name: "Task" }), 200);
  assert.equal(await post(port, "/hooks/claude/tool", { tool_name: "Edit" }), 200);
  const state = (await (await fetch(`http://127.0.0.1:${port}/state.json?hud=1`)).json()) as { stats: { subAgents: number } };
  assert.equal(state.stats.subAgents, 2);

  // B8: the prompt is counted, but its text never reaches the event log.
  const canary = "CANARY-PROMPT-7f3a9 refactor the widget";
  assert.equal(await post(port, "/hooks/claude/prompt", { prompt: canary }), 200);
  const events = await readFile(path.join(home, ".vibelog", "events.jsonl"), "utf8");
  assert.match(events, /"type":"prompt_submitted"/);
  assert.doesNotMatch(events, /CANARY-PROMPT-7f3a9/);
  const report = await vibe(["report"], home);
  assert.match(report.stdout, /1 prompts?/);

  // B5: end stops the agent and removes session.json.
  const out = await vibe(["end"], home);
  assert.equal(out.code, 0);
  await exited;
  assert.equal(await exists(sessionFile), false);
});
