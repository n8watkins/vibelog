import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getBranch, getStats } from "./git.ts";
import { getClaudeTokensToday, sessionTokenDelta, localDateString } from "./ccusage.ts";
import { readEvents, summarizeDay, summarizeWeek } from "./report.ts";
import { summarizeRange } from "./chart.ts";
import { redact } from "./redact.ts";
import {
  BUILD_LOG_MAX,
  BUILD_MODES,
  emptyState,
  type BuildMode,
  type LiveState,
} from "./state.ts";
import { appendEvent, readSession, writeSession, writeState, type Session } from "./store.ts";

const GIT_POLL_MS = 5_000;
const TOKEN_POLL_MS = 30_000;

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const OVERLAY_FILE = path.join(PUBLIC_DIR, "overlay.html");
const LIVE_FILE = path.join(PUBLIC_DIR, "live.html");
const DASHBOARD_FILE = path.join(PUBLIC_DIR, "dashboard.html");

/**
 * Routes a remote viewer is allowed to see. The agent binds 0.0.0.0 and
 * `vibe share` tunnels the *whole* port, so we must gate everything else:
 * only these read-only GET routes are safe to expose. Writes (mark/building/
 * end/hooks) and the private /dashboard are localhost-only — see isRemote().
 */
const PUBLIC_GET_ROUTES = new Set(["/", "/overlay", "/live", "/state.json"]);

/**
 * True if a request did NOT originate directly from this machine. A Cloudflare
 * tunnel (cloudflared, behind `vibe share`) forwards from localhost, so the
 * socket address looks local — the real tell is the forwarding headers it adds.
 * We treat any forwarded/non-loopback request as remote (untrusted).
 */
export function isRemote(req: {
  headers: IncomingMessage["headers"];
  socket: { remoteAddress?: string | undefined };
}): boolean {
  const h = req.headers;
  if (
    h["x-forwarded-for"] ||
    h["forwarded"] ||
    h["x-forwarded-host"] ||
    h["cf-connecting-ip"] ||
    h["cf-ray"]
  ) {
    return true;
  }
  const addr = req.socket.remoteAddress ?? "";
  const loopback =
    addr === "" || addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  return !loopback;
}

/**
 * The agent: one process that owns the authoritative LiveState in memory,
 * polls git/ccusage to keep stats fresh, accepts mutations over HTTP, and
 * serves the overlay + /state.json. See V0_SPEC.md §4 / §7.
 */
export async function runAgent(port: number, opts: { demo?: boolean } = {}): Promise<void> {
  let session = opts.demo ? demoSession() : await readSession();
  if (!session) {
    console.error("No active session. Run `vibe start` first.");
    process.exit(1);
  }

  let state: LiveState = emptyState();

  function render(): void {
    state.isLive = true;
    state.sessionTitle = session!.title;
    state.project = session!.project;
    state.nowBuilding = session!.nowBuilding;
    state.buildLog = session!.buildLog;
    state.stats.features = session!.features;
    state.stats.bugs = session!.bugs;
    state.startedAt = session!.startedAt;
    state.updatedAt = new Date().toISOString();
    void writeState(state);
  }

  async function persistSession(): Promise<void> {
    await writeSession(session!);
  }

  async function pollGit(): Promise<void> {
    try {
      const [stats, branch] = await Promise.all([
        getStats(session!.cwd, session!.baseline),
        getBranch(session!.cwd),
      ]);
      state.stats.linesAdded = stats.linesAdded;
      state.stats.linesRemoved = stats.linesRemoved;
      state.stats.filesChanged = stats.filesChanged;
      state.stats.commits = stats.commits;
      state.branch = branch;
      render();
    } catch {
      // transient git errors (mid-rebase, etc.) — keep last good stats
    }
  }

  async function pollTokens(): Promise<void> {
    const today = await getClaudeTokensToday();
    if (today === null) return; // ccusage unavailable — leave at 0

    const { tokens, baseline } = sessionTokenDelta(today, session!.tokenBaseline);
    if (baseline !== session!.tokenBaseline) {
      session!.tokenBaseline = baseline;
      await persistSession();
    }
    state.stats.claudeTokens = tokens;
    render();
  }

  // ---- mutations -----------------------------------------------------------

  async function setBuilding(rawTitle: string, mode: BuildMode): Promise<void> {
    const title = redact(rawTitle).slice(0, 140);
    session!.nowBuilding = { title, mode };
    await persistSession();
    await appendEvent({ type: "now_building", title, mode });
    render();
  }

  async function addMark(kind: string, rawText: string): Promise<void> {
    const text = redact(rawText).slice(0, 140);
    const icon = kind === "bug" ? "🐛" : kind === "feature" ? "✨" : "•";
    session!.buildLog = [`${icon} ${text}`, ...session!.buildLog].slice(0, BUILD_LOG_MAX);
    if (kind === "feature") session!.features += 1;
    if (kind === "bug") session!.bugs += 1;
    await persistSession();
    await appendEvent({ type: "mark", kind, text });
    render();
  }

  async function endSession(): Promise<void> {
    state.isLive = false;
    state.updatedAt = new Date().toISOString();
    await writeState(state);
    await appendEvent({ type: "session_ended", title: session!.title });
  }

  // ---- claude hooks (dumb script in, smart agent here) ---------------------

  /** UserPromptSubmit → set "Now Building" from a sanitized first line. */
  async function onPrompt(rawPrompt: string): Promise<void> {
    const firstLine = rawPrompt.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    const title = redact(firstLine).slice(0, 120);
    await appendEvent({ type: "prompt_submitted", title });
    if (!title) return;
    session!.nowBuilding = { title, mode: session!.nowBuilding?.mode ?? "coding" };
    await persistSession();
    render();
  }

  /** PostToolUse → log + refresh git promptly so stats feel live after edits. */
  async function onTool(tool: string): Promise<void> {
    await appendEvent({ type: "tool_used", tool });
    void pollGit();
  }

  /** Stop → Claude finished a response; refresh stats. */
  async function onStop(): Promise<void> {
    await appendEvent({ type: "claude_stopped" });
    void pollGit();
  }

  // ---- http ----------------------------------------------------------------

  function sendJson(res: ServerResponse, code: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(code, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(payload);
  }

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return {};
    }
  }

  const server = createServer(async (req, res) => {
    try {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", `http://localhost:${port}`);
      } catch {
        // Malformed request target (e.g. `//`) — reject, never crash the agent.
        sendJson(res, 400, { error: "bad request" });
        return;
      }
      const route = url.pathname;

      // Remote (tunneled / LAN) callers get read-only public routes only —
      // never the write endpoints, hooks, or the private dashboard.
      if (isRemote(req) && !(req.method === "GET" && PUBLIC_GET_ROUTES.has(route))) {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }

      if (req.method === "GET" && (route === "/" || route === "/overlay")) {
        const html = await readFile(OVERLAY_FILE, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && route === "/live") {
        const html = await readFile(LIVE_FILE, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && route === "/state.json") {
        sendJson(res, 200, state);
        return;
      }

      // Private dashboard (localhost) — a richer browser view than the CLI.
      if (req.method === "GET" && route === "/dashboard") {
        const html = await readFile(DASHBOARD_FILE, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }

      // One-shot payload for the dashboard: live state + today + week + heatmap.
      if (req.method === "GET" && route === "/api/dashboard.json") {
        const days = Math.max(7, Math.min(371, Number(url.searchParams.get("days")) || 84));
        const events = await readEvents();
        const today = localDateString();
        sendJson(res, 200, {
          live: state,
          today: summarizeDay(events, today),
          week: summarizeWeek(events, today),
          chart: summarizeRange(events, days),
        });
        return;
      }

      if (req.method === "POST" && route === "/building") {
        const body = await readBody(req);
        const title = String(body.title ?? "");
        const mode = (BUILD_MODES as string[]).includes(String(body.mode))
          ? (body.mode as BuildMode)
          : "coding";
        if (!title.trim()) return sendJson(res, 400, { error: "title required" });
        await setBuilding(title, mode);
        return sendJson(res, 200, { ok: true, nowBuilding: state.nowBuilding });
      }

      if (req.method === "POST" && route === "/mark") {
        const body = await readBody(req);
        const kind = String(body.kind ?? "note");
        const text = String(body.text ?? "");
        if (!text.trim()) return sendJson(res, 400, { error: "text required" });
        await addMark(kind, text);
        return sendJson(res, 200, { ok: true, buildLog: state.buildLog });
      }

      if (req.method === "POST" && route === "/end") {
        await endSession();
        sendJson(res, 200, { ok: true });
        setTimeout(() => process.exit(0), 100);
        return;
      }

      // Claude Code hooks. The script forwards raw hook stdin JSON; we pull the
      // fields we care about. Always 200 fast so we never block Claude.
      if (req.method === "POST" && route.startsWith("/hooks/claude/")) {
        const kind = route.slice("/hooks/claude/".length);
        const body = await readBody(req);
        if (kind === "prompt") await onPrompt(String(body.prompt ?? ""));
        else if (kind === "tool") await onTool(String(body.tool_name ?? body.tool ?? "tool"));
        else if (kind === "stop") await onStop();
        return sendJson(res, 200, { ok: true });
      }

      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));

  const timers: NodeJS.Timeout[] = [];
  if (opts.demo) {
    // No git/ccusage — just animate plausible stats so the overlay looks alive.
    state.branch = "main";
    state.stats = { ...state.stats, linesAdded: 842, linesRemoved: 219, filesChanged: 13, commits: 4, features: 3, bugs: 2, claudeTokens: 1_240_000 };
    render();
    timers.push(setInterval(() => {
      state.stats.linesAdded += Math.floor(Math.random() * 12);
      state.stats.claudeTokens += Math.floor(Math.random() * 4000);
      render();
    }, 2000));
  } else {
    await pollGit();
    void pollTokens();
    timers.push(setInterval(() => void pollGit(), GIT_POLL_MS));
    timers.push(setInterval(() => void pollTokens(), TOKEN_POLL_MS));
  }

  const shutdown = () => {
    timers.forEach(clearInterval);
    state.isLive = false;
    void writeState(state);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`\n  VibeLog agent live on http://localhost:${port}${opts.demo ? "  (DEMO)" : ""}`);
  console.log(`  OBS Browser Source →  http://localhost:${port}/overlay`);
  if (opts.demo) console.log(`  Browser preview     →  http://localhost:${port}/overlay?preview`);
  console.log(`  Session: ${session.title ?? "(untitled)"}  ·  project: ${session.project?.name ?? "—"}`);
  if (!opts.demo) console.log(`  Watching: ${session.cwd}`);
  console.log(`\n  ${opts.demo ? "Ctrl-C to stop." : "Run `vibe building` / `vibe mark` / `vibe end` from another terminal."}\n`);
}

function demoSession(): Session {
  return {
    cwd: process.cwd(),
    port: 0,
    baseline: null,
    startedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(), // 47m ago
    title: "Building the live tracker",
    project: { name: "VibeLog", status: "active" },
    nowBuilding: { title: "Wiring the live stats card into the overlay", mode: "coding" },
    buildLog: [
      "✨ live LOC counter works",
      "✨ overlay reads /state.json",
      "🐛 fixed double-count on git stash",
      "• chose Cloudflare Tunnel for public /live",
      "✨ redactor scrubs secrets from build log",
    ],
    features: 3,
    bugs: 2,
    tokenBaseline: null,
  };
}

export type { Session };
