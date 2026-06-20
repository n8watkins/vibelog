#!/usr/bin/env -S npx tsx
import { Command } from "commander";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "./config.ts";
import { getHead, isGitRepo } from "./git.ts";
import { BUILD_MODES, type BuildMode } from "./state.ts";
import { getTokensByProject, labelProjects } from "./claude-projects.ts";
import { localDateString } from "./ccusage.ts";
import { formatReport, formatWeekly, readEvents, summarizeDay, summarizeWeek } from "./report.ts";
import { formatChart, summarizeRange } from "./chart.ts";
import { recapSummary } from "./summarize.ts";
import { readConfig, readSession, readState, writeConfig, writeSession, appendEvent } from "./store.ts";
import { runAgent } from "./agent.ts";
import { loginCommand as twitchLogin } from "./twitch-oauth.ts";

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
  .description("Set defaults (default project name, channel links)")
  .option("-p, --project <name>", "default project name")
  .option("--twitch <url>", "Twitch channel URL (shown on the dashboard)")
  .option("--youtube <url>", "YouTube channel URL (shown on the dashboard)")
  .action(async (opts: { project?: string; twitch?: string; youtube?: string }) => {
    const cfg = (await readConfig()) ?? { defaultProject: null };
    if (opts.project) cfg.defaultProject = opts.project;
    if (opts.twitch !== undefined) cfg.twitch = opts.twitch || null;
    if (opts.youtube !== undefined) cfg.youtube = opts.youtube || null;
    await writeConfig(cfg);
    console.log(`Saved. Default project: ${cfg.defaultProject ?? "(none)"}`);
    if (cfg.twitch || cfg.youtube) console.log(`Channels: ${[cfg.twitch, cfg.youtube].filter(Boolean).join("  ")}`);
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
      subAgents: 0,
      prompts: 0,
      tokenBaseline: null,
      costBaseline: null,
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

// ---- claude hooks --------------------------------------------------------

const HOOK_SCRIPT = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "hooks",
  "claude-hook.mjs",
);

type HookEntry = { matcher?: string; hooks: { type: "command"; command: string }[] };

function vibeHooksConfig(): Record<string, HookEntry[]> {
  const cmd = (event: string) => `node ${JSON.stringify(HOOK_SCRIPT)} ${event}`;
  return {
    UserPromptSubmit: [{ hooks: [{ type: "command", command: cmd("prompt") }] }],
    PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: cmd("tool") }] }],
    Stop: [{ hooks: [{ type: "command", command: cmd("stop") }] }],
  };
}

const hooks = program.command("hooks").description("Wire VibeLog into Claude Code hooks");

hooks
  .command("print")
  .description("Print the settings.json hooks block to paste manually")
  .action(() => {
    console.log(JSON.stringify({ hooks: vibeHooksConfig() }, null, 2));
  });

hooks
  .command("install")
  .description("Merge VibeLog hooks into a Claude Code settings.json")
  .option("--global", "install into ~/.claude/settings.json")
  .option("--dir <path>", "install into <path>/.claude/settings.json")
  .action(async (opts: { global?: boolean; dir?: string }) => {
    const target = opts.dir
      ? path.join(path.resolve(opts.dir), ".claude", "settings.json")
      : opts.global
        ? path.join(os.homedir(), ".claude", "settings.json")
        : path.join(process.cwd(), ".claude", "settings.json");

    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(target, "utf8"));
    } catch {
      // new file
    }

    const existing = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
    const ours = vibeHooksConfig();
    const merged: Record<string, HookEntry[]> = { ...existing };
    for (const [event, entries] of Object.entries(ours)) {
      // Drop any prior VibeLog entries first (idempotent), then add ours back.
      const others = (existing[event] ?? []).filter(
        (e) => !e.hooks.some((h) => h.command.includes("claude-hook.mjs")),
      );
      merged[event] = [...others, ...entries];
    }
    settings.hooks = merged;

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(settings, null, 2) + "\n");
    console.log(`Installed VibeLog hooks into ${target}`);
    console.log("Restart Claude Code (or open a new session) for them to take effect.");
  });

program
  .command("tokens")
  .description("Claude tokens by project (from local transcripts)")
  .option("--days <n>", "only the last N days")
  .option("--since <date>", "only since YYYY-MM-DD")
  .option("--top <n>", "show the top N projects", "15")
  .action(async (opts: { days?: string; since?: string; top: string }) => {
    let since: string | null = opts.since ?? null;
    if (!since && opts.days) {
      const d = new Date();
      d.setDate(d.getDate() - (Number(opts.days) - 1));
      const pad = (n: number) => String(n).padStart(2, "0");
      since = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    const fmt = (n: number) =>
      n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1_000 ? (n / 1_000).toFixed(1) + "k" : String(n);

    process.stdout.write("Reading Claude transcripts…\r");
    const rows = await getTokensByProject({ since });
    if (!rows.length) {
      console.log("No Claude usage found in ~/.claude/projects.            ");
      return;
    }

    // Shortest unique path suffix per project (disambiguates same-named dirs).
    const labels = labelProjects(rows.map((r) => r.cwd));
    const label = (r: (typeof rows)[number]) => labels.get(r.cwd) ?? r.project;

    const top = rows.slice(0, Number(opts.top) || 15);
    const max = top[0]!.tokens || 1;
    const grand = rows.reduce((s, r) => s + r.tokens, 0);
    const nameW = Math.min(32, Math.max(...top.map((r) => label(r).length)));

    console.log(`\nClaude tokens by project${since ? ` (since ${since})` : ""}\n`);
    for (const r of top) {
      const bar = "█".repeat(Math.round((r.tokens / max) * 24)) || "▏";
      const name = label(r).padEnd(nameW).slice(0, nameW);
      const pct = ((r.tokens / grand) * 100).toFixed(0);
      console.log(`${name}  ${fmt(r.tokens).padStart(7)}  ${pct.padStart(3)}%  ${bar}`);
    }
    console.log(`\nTotal: ${fmt(grand)} tokens across ${rows.length} projects.`);
  });

program
  .command("share")
  .description("Expose the public /live page via a free Cloudflare Tunnel")
  .option("--port <port>", "HTTP port", String(DEFAULT_PORT))
  .action((opts: { port: string }) => {
    const port = Number(opts.port) || DEFAULT_PORT;
    console.log(`Starting Cloudflare Tunnel → http://localhost:${port}`);
    console.log("Your viewers' page will be  <the trycloudflare URL>/live\n");
    const proc = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: "inherit",
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        console.error("\ncloudflared not found. Install it (free), then re-run:");
        console.error("  macOS:    brew install cloudflared");
        console.error("  Windows:  winget install --id Cloudflare.cloudflared");
        console.error("  Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
        process.exit(1);
      }
      throw err;
    });
  });

const twitch = program.command("twitch").description("Twitch broadcaster integration");

twitch
  .command("login")
  .description("Authorize VibeLog to read your Twitch follower count (one-time OAuth)")
  .action(async () => {
    try {
      await twitchLogin();
    } catch (err) {
      // err.message only — never log token values or the request.
      console.error(`Twitch login failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command("report [day]")
  .description("Recap from your local log (day: today|yesterday|week|YYYY-MM-DD)")
  .option("--ai", "add a 1-2 sentence AI narrative recap (local LLM → Gemini → template)")
  .action(async (day: string | undefined, opts: { ai?: boolean }) => {
    if (day === "week") {
      console.log("\n" + formatWeekly(summarizeWeek(await readEvents(), localDateString())) + "\n");
      return;
    }
    let date = localDateString();
    if (day && day !== "today") {
      if (day === "yesterday") {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        date = localDateString(d);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        date = day;
      } else {
        console.error(`Bad day "${day}". Use today, yesterday, or YYYY-MM-DD.`);
        process.exit(1);
      }
    }

    const summary = summarizeDay(await readEvents(), date);

    // Pull LOC/commit/token totals from the last state snapshot, but only if it
    // belongs to the day we're reporting on.
    const state = await readState();
    const session = await readSession();
    const sameDay = state && localDateString(new Date(state.updatedAt)) === date;
    const stats = sameDay ? state.stats : null;
    const project = sameDay ? (state.project?.name ?? session?.project?.name ?? null) : null;

    const reportText = formatReport(summary, stats, project);
    console.log("\n" + reportText + "\n");

    if (opts.ai) {
      // Narrative goes to the TERMINAL only and is built from day STATS, not raw
      // prompts. Uses the same provider chain as the overlay summarizer; the
      // local path is loopback-only and only err.message is ever logged.
      const recap = await recapSummary(reportText);
      console.log(`✨ Recap: ${recap.text}\n`);
    }
  });

program
  .command("chart")
  .description("Activity heatmap + Vibe Score from your local log")
  .option("--days <n>", "how many days to chart", "84")
  .action(async (opts: { days: string }) => {
    const days = Math.max(7, Math.min(371, Number(opts.days) || 84));
    const stats = summarizeRange(await readEvents(), days);
    console.log("\n" + formatChart(stats) + "\n");
  });

program
  .command("mcp")
  .description("Run the VibeLog MCP server (stdio) for Claude Desktop — read state + apply themes")
  .action(async () => {
    const { runServer } = await import("./mcp.ts");
    await runServer();
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
