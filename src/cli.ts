#!/usr/bin/env -S npx tsx
import { Command } from "commander";
import { DEFAULT_PORT } from "./config.ts";
import { getHead, isGitRepo } from "./git.ts";
import { BUILD_MODES, type BuildMode } from "./state.ts";
import { readConfig, readSession, writeConfig, writeSession, appendEvent } from "./store.ts";
import { runAgent } from "./agent.ts";

const program = new Command();
program.name("vibe").description("VibeLog — live coding telemetry + OBS overlay (V0)").version("0.0.0");

/** POST to the running agent; friendly error if it isn't up. */
async function callAgent(pathname: string, body: unknown): Promise<void> {
  const session = await readSession();
  if (!session) {
    console.error("No active session. Run `vibe start` first.");
    process.exit(1);
  }
  const url = `http://127.0.0.1:${session.port}${pathname}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      console.error(`Agent error: ${data.error ?? res.statusText}`);
      process.exit(1);
    }
  } catch {
    console.error(`Can't reach the agent at ${url}. Is \`vibe start\` running?`);
    process.exit(1);
  }
}

program
  .command("init")
  .description("Set defaults (default project name)")
  .option("-p, --project <name>", "default project name")
  .action(async (opts: { project?: string }) => {
    const cfg = (await readConfig()) ?? { defaultProject: null };
    if (opts.project) cfg.defaultProject = opts.project;
    await writeConfig(cfg);
    console.log(`Saved. Default project: ${cfg.defaultProject ?? "(none)"}`);
  });

program
  .command("start")
  .description("Start a session and run the overlay agent (foreground)")
  .option("-p, --project <name>", "project name")
  .option("-t, --title <title>", "session/stream title")
  .option("--cwd <path>", "repo to watch (default: current directory)")
  .option("--port <port>", "HTTP port", String(DEFAULT_PORT))
  .action(async (opts: { project?: string; title?: string; cwd?: string; port: string }) => {
    const cwd = opts.cwd ?? process.cwd();
    const port = Number(opts.port) || DEFAULT_PORT;
    const cfg = await readConfig();
    const projectName = opts.project ?? cfg?.defaultProject ?? null;

    if (!(await isGitRepo(cwd))) {
      console.error(`Not a git repo: ${cwd}\nPass --cwd <path> to point at the project you're streaming.`);
      process.exit(1);
    }
    const baseline = await getHead(cwd);

    await writeSession({
      cwd,
      port,
      baseline,
      startedAt: new Date().toISOString(),
      title: opts.title ?? null,
      project: projectName ? { name: projectName, status: "active" } : null,
      nowBuilding: null,
      buildLog: [],
      features: 0,
      bugs: 0,
    });
    await appendEvent({ type: "session_started", title: opts.title ?? null, project: projectName });

    await runAgent(port);
  });

program
  .command("demo")
  .description("Preview the overlay with fake data (no git/session needed)")
  .option("--port <port>", "HTTP port", String(DEFAULT_PORT))
  .action(async (opts: { port: string }) => {
    await runAgent(Number(opts.port) || DEFAULT_PORT, { demo: true });
  });

program
  .command("building <text>")
  .description("Set the 'Now Building' card")
  .option("-m, --mode <mode>", `build mode (${BUILD_MODES.join(", ")})`, "coding")
  .action(async (text: string, opts: { mode: string }) => {
    const mode: BuildMode = (BUILD_MODES as string[]).includes(opts.mode)
      ? (opts.mode as BuildMode)
      : "coding";
    await callAgent("/building", { title: text, mode });
    console.log(`Now building: ${text} [${mode}]`);
  });

const mark = program.command("mark").description("Mark a milestone in the build log");
for (const kind of ["feature", "bug", "decision", "polish", "note"]) {
  mark
    .command(`${kind} <text>`)
    .description(`mark a ${kind}`)
    .action(async (text: string) => {
      await callAgent("/mark", { kind, text });
      console.log(`Marked ${kind}: ${text}`);
    });
}

program
  .command("end")
  .description("End the session and stop the agent")
  .action(async () => {
    await callAgent("/end", {});
    console.log("Session ended.");
  });

program
  .command("status")
  .description("Show the current live state")
  .action(async () => {
    const session = await readSession();
    if (!session) {
      console.log("No active session.");
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${session.port}/state.json`);
      const state = await res.json();
      console.log(JSON.stringify(state, null, 2));
    } catch {
      console.log("Session file exists but agent isn't running. Run `vibe start`.");
    }
  });

program.parseAsync();
