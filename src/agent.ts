import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getBranch, getStats } from "./git.ts";
import { getClaudeUsageToday, dailyUsageMap, sessionTokenDelta, localDateString } from "./ccusage.ts";
import { readEvents, summarizeDay, summarizeWeek } from "./report.ts";
import { summarizeRange, currentStreak } from "./chart.ts";
import { redact } from "./redact.ts";
import {
  BUILD_LOG_MAX,
  BUILD_MODES,
  emptyState,
  type BuildMode,
  type LiveState,
} from "./state.ts";
import { appendEvent, readConfig, readSession, writeSession, writeState, type Session } from "./store.ts";
import { demoDashboard, demoToday, demoWeek, demoSocialGrowth } from "./demodata.ts";
import { getProjectActivity, type ProjectActivity } from "./projects.ts";
import { summarize } from "./summarize.ts";
import { connectOBS, type OBSHandle } from "./obs.ts";
import { streamMinutesByDay } from "./stream.ts";
import { readSecrets } from "./secrets.ts";
import { fetchSocial, socialGrowth } from "./social.ts";

const GIT_POLL_MS = 5_000;
const TOKEN_POLL_MS = 30_000;
const SOCIAL_POLL_MS = 180_000;

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
    state.stats.subAgents = session!.subAgents;
    state.stats.prompts = session!.prompts;
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

  /** Streak + today's vibe score from the event log (gamified overlay stats). */
  async function refreshHistory(): Promise<void> {
    try {
      const range = summarizeRange(await readEvents(), 371);
      state.stats.streak = currentStreak(range);
      state.stats.vibeScore = range[range.length - 1]?.score ?? 0;
      render();
    } catch {
      // event log unreadable — keep last good values
    }
  }

  async function pollTokens(): Promise<void> {
    const usage = await getClaudeUsageToday();
    if (usage === null) return; // ccusage unavailable — leave at 0

    const tok = sessionTokenDelta(usage.tokens, session!.tokenBaseline);
    const cost = sessionTokenDelta(usage.cost, session!.costBaseline);
    if (tok.baseline !== session!.tokenBaseline || cost.baseline !== session!.costBaseline) {
      session!.tokenBaseline = tok.baseline;
      session!.costBaseline = cost.baseline;
      await persistSession();
    }
    state.stats.claudeTokens = tok.tokens;
    state.stats.costUsd = cost.tokens;
    render();
  }

  // Live status + audience counts (Twitch/YouTube). Snapshots followers once per
  // day to the event log so the dashboard can chart channel growth over time.
  let lastSnapDay = "";
  async function pollSocial(): Promise<void> {
    const social = await fetchSocial();
    if (!social) return; // no channels configured
    state.social = social;
    render();
    const day = localDateString();
    if (day === lastSnapDay) return;
    lastSnapDay = day;
    for (const platform of ["twitch", "youtube"] as const) {
      const ch = social[platform];
      if (ch?.followers != null) {
        await appendEvent({ type: "social_snapshot", platform, followers: ch.followers, views: ch.views ?? null });
      }
    }
  }

  // Per-day usage is for the dashboard heatmap only and barely changes, but the
  // dashboard polls every 4s — cache it so we don't spawn ccusage 15×/min.
  let usageCache: { at: number; data: Record<string, { tokens: number; cost: number }> } = {
    at: 0,
    data: {},
  };
  async function cachedUsageByDay(): Promise<Record<string, { tokens: number; cost: number }>> {
    if (Date.now() - usageCache.at < 60_000) return usageCache.data;
    const m = await dailyUsageMap();
    if (m) usageCache = { at: Date.now(), data: m };
    return usageCache.data;
  }

  // Per-project activity joins transcripts + git (several git spawns) — heavy, so
  // cache it the same way; the dashboard's per-project view polls every 4s.
  let projCache: { at: number; data: ProjectActivity } = { at: 0, data: { projects: [], byDay: {} } };
  async function cachedProjectActivity(costPerToken: number): Promise<ProjectActivity> {
    if (Date.now() - projCache.at < 60_000) return projCache.data;
    const since = localDateString(new Date(Date.now() - 371 * 86_400_000));
    try {
      projCache = { at: Date.now(), data: await getProjectActivity({ since, costPerToken }) };
    } catch {
      // transcripts/git unavailable — keep last good (or empty) activity
    }
    return projCache.data;
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
    const entry = { text: `${icon} ${text}`, ts: new Date().toISOString() };
    session!.buildLog = [entry, ...session!.buildLog].slice(0, BUILD_LOG_MAX);
    if (kind === "feature") session!.features += 1;
    if (kind === "bug") session!.bugs += 1;
    await persistSession();
    await appendEvent({ type: "mark", kind, text });
    render();
    void refreshHistory();
  }

  async function endSession(): Promise<void> {
    state.isLive = false;
    state.updatedAt = new Date().toISOString();
    await writeState(state);
    await appendEvent({ type: "session_ended", title: session!.title });
  }

  // ---- claude hooks (dumb script in, smart agent here) ---------------------

  /**
   * UserPromptSubmit → set "Now Building". We respond fast with a sanitized
   * first line (so the overlay updates instantly and Claude is never blocked),
   * then refine it in the background with a generated feature label from the
   * summarizer (Gemini 3.1 Flash-Lite, template fallback). The raw prompt is
   * never persisted or sent to LiveState; only the redacted label is.
   */
  async function onPrompt(rawPrompt: string): Promise<void> {
    const firstLine = rawPrompt.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    const title = redact(firstLine).slice(0, 120);
    session!.prompts += 1;
    await appendEvent({ type: "prompt_submitted", title });
    const mode = session!.nowBuilding?.mode ?? "coding";
    if (title) {
      session!.nowBuilding = { title, mode };
      await persistSession();
      render();
      void refreshHistory();
    } else {
      await persistSession();
      render();
    }

    // Refine asynchronously — upgrade the title to the generated feature label.
    void summarize(rawPrompt).then((s) => {
      const label = redact(s.text).slice(0, 140);
      if (!label) return;
      session!.nowBuilding = { title: label, mode };
      void persistSession();
      render();
    });
  }

  /** PostToolUse → log + refresh git promptly so stats feel live after edits.
   *  The `Task` tool spawns a sub-agent — count those; they're the signal we
   *  surface on /live (raw tool calls are noise). */
  async function onTool(tool: string): Promise<void> {
    await appendEvent({ type: "tool_used", tool });
    if (tool === "Task") {
      session!.subAgents += 1;
      await persistSession();
      await appendEvent({ type: "subagent_used" });
    }
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
      // `days` picks the range (31 = month, 371 = year); `project` scopes it.
      if (req.method === "GET" && route === "/api/dashboard.json") {
        const days = Math.max(7, Math.min(371, Number(url.searchParams.get("days")) || 371));
        const project = url.searchParams.get("project");

        // Demo: a full seeded year so the calendar looks alive, plus per-project
        // attribution that ccusage/git can't give us yet (see docs/INFRA_PLAN.md).
        if (opts.demo) {
          const dd = demoDashboard({ days, project });
          sendJson(res, 200, {
            live: state,
            today: demoToday(),
            week: demoWeek(),
            chart: dd.chart,
            usageByDay: dd.usageByDay,
            projects: dd.projects,
            activeProject: dd.activeProject,
            social: state.social,
            socialGrowth: demoSocialGrowth(),
            socials: { twitch: "https://twitch.tv/yourchannel", youtube: "https://youtube.com/@yourchannel" },
          });
          return;
        }

        const events = await readEvents();
        const today = localDateString();
        const usage = await cachedUsageByDay();

        // Blended $/token from ccusage totals — used to estimate per-project cost
        // (ccusage gives no project dimension). Fallback ~$2/Mtok if unknown.
        let sumTok = 0;
        let sumCost = 0;
        for (const u of Object.values(usage)) {
          sumTok += u.tokens || 0;
          sumCost += u.cost || 0;
        }
        const costPerToken = sumTok > 0 ? sumCost / sumTok : 0.000002;
        const activity = await cachedProjectActivity(costPerToken);
        const chart = summarizeRange(events, days);
        // Real stream minutes per day from OBS live_started/live_ended events.
        const streamByDay = streamMinutesByDay(events);

        // Scope the heatmap: a single project (colored by commits) or all
        // projects (real ccusage tokens, with per-day commits summed across repos).
        const sel = project && project !== "all"
          ? activity.projects.find((p) => p.name === project)
          : null;

        const usageByDay: Record<string, { tokens: number; cost: number; commits: number; features: number; stream: number }> = {};
        if (sel) {
          const pd = activity.byDay[sel.name] ?? {};
          for (const d of chart) {
            const x = pd[d.date];
            const t = x?.tokens ?? 0;
            usageByDay[d.date] = { tokens: t, cost: +(t * costPerToken).toFixed(2), commits: x?.commits ?? 0, features: 0, stream: streamByDay[d.date] ?? 0 };
          }
        } else {
          // Total commits per day across all projects, for the all-projects strip.
          const commitsByDay: Record<string, number> = {};
          for (const pd of Object.values(activity.byDay)) {
            for (const [date, v] of Object.entries(pd)) commitsByDay[date] = (commitsByDay[date] ?? 0) + v.commits;
          }
          for (const d of chart) {
            const u = usage[d.date];
            usageByDay[d.date] = { tokens: u?.tokens ?? 0, cost: u?.cost ?? 0, commits: commitsByDay[d.date] ?? 0, features: 0, stream: streamByDay[d.date] ?? 0 };
          }
        }

        const week = summarizeWeek(events, today);
        const weekStream = week.days.reduce((s, d) => s + (streamByDay[d.date] ?? 0), 0);

        sendJson(res, 200, {
          live: state,
          today: summarizeDay(events, today),
          week: { ...week, streamMinutes: weekStream },
          chart,
          usageByDay,
          projects: activity.projects,
          activeProject: sel?.name ?? null,
          social: state.social,
          socialGrowth: socialGrowth(events),
          socials: await readConfig().then((c) => ({ twitch: c?.twitch ?? null, youtube: c?.youtube ?? null })),
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

  // OBS websocket bridge: learn when streaming actually starts/stops so we can
  // track "did I show up today" (logged to events → per-day stream minutes).
  let obs: OBSHandle | null = null;
  async function connectStreamCapture(): Promise<void> {
    const s = await readSecrets();
    if (s.obs?.enabled === false) return;
    const url = s.obs?.url ?? "ws://127.0.0.1:4455";
    let live = false;
    obs = connectOBS({
      url,
      password: s.obs?.password,
      onLog: (m) => console.log(`  [obs] ${m}`),
      onLive: (active) => {
        if (active === live) return;
        live = active;
        state.streaming = active;
        void appendEvent({ type: active ? "live_started" : "live_ended" });
        render();
      },
    });
  }

  const timers: NodeJS.Timeout[] = [];
  if (opts.demo) {
    runDemoLoop(session, state, render, timers);
  } else {
    await pollGit();
    void pollTokens();
    void refreshHistory();
    void connectStreamCapture();
    void pollSocial();
    timers.push(setInterval(() => void pollGit(), GIT_POLL_MS));
    timers.push(setInterval(() => void pollTokens(), TOKEN_POLL_MS));
    timers.push(setInterval(() => void refreshHistory(), 60_000));
    timers.push(setInterval(() => void pollSocial(), SOCIAL_POLL_MS));
  }

  const shutdown = () => {
    timers.forEach(clearInterval);
    obs?.close();
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
      { text: "✨ redactor scrubs secrets from build log", ts: ago(2) },
      { text: "• chose Cloudflare Tunnel for public /live", ts: ago(11) },
      { text: "🐛 fixed double-count on git stash", ts: ago(19) },
      { text: "✨ overlay reads /state.json", ts: ago(28) },
      { text: "✨ live LOC counter works", ts: ago(41) },
    ],
    features: 3,
    bugs: 2,
    subAgents: 2,
    prompts: 37,
    tokenBaseline: null,
    costBaseline: null,
  };
}

/** ISO timestamp `m` minutes ago — for plausible demo feed timestamps. */
function ago(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

/**
 * Fake but coherent demo data — a looping stream of features being built across
 * a handful of projects, with the projects ticker reordering as focus shifts.
 * Pure UI prototype (no git/ccusage/AI); the loop resets so it visibly restarts.
 * Writes session-backed fields (nowBuilding/buildLog/features/prompts/subAgents)
 * to `session` so render() carries them; stats render() doesn't own go on state.
 */
function runDemoLoop(
  session: Session,
  state: LiveState,
  render: () => void,
  timers: NodeJS.Timeout[],
): void {
  state.branch = "main";
  const base = ["VibeLog", "pooled-engine", "ask-me-cutely", "date-planner", "website-template"];
  state.projects = base.map((name, i) => ({
    name,
    status: i === 0 ? "active" : "idle",
    note: i === 0 ? "now" : `${i * 7 + 3}m ago`,
  }));
  state.stats.commits = 4;
  state.stats.claudeTokens = 120_000;
  state.stats.costUsd = 0.4;
  state.stats.streak = 6;
  state.streaming = true;
  state.social = {
    twitch: { live: true, followers: 1240, viewers: 87, url: "https://twitch.tv/yourchannel" },
    youtube: { live: false, followers: 3210, views: 142_000, url: "https://youtube.com/@yourchannel" },
    updatedAt: new Date().toISOString(),
  };
  session.features = 1;
  session.bugs = 0;
  session.subAgents = 1;
  session.prompts = 6;
  session.nowBuilding = { title: "Live stats card on the overlay", mode: "coding" };
  session.buildLog = [{ text: "Live stats card on the overlay", ts: new Date().toISOString() }];
  render();

  // Smooth token/cost burn so the numbers feel alive.
  timers.push(setInterval(() => {
    const dt = 800 + Math.floor(Math.random() * 3500);
    state.stats.claudeTokens += dt;
    state.stats.costUsd += dt * 0.0000033;
    render();
  }, 2000));

  // The looping feature stream — each feature belongs to a project that bubbles
  // to the top of the ticker when it's worked on.
  const script: { project: string; feature: string }[] = [
    { project: "pooled-engine", feature: "Batch warm-pool allocator" },
    { project: "ask-me-cutely", feature: "Cuteness prompt rephraser" },
    { project: "VibeLog", feature: "Projects ticker animation" },
    { project: "date-planner", feature: "Itinerary auto-builder" },
    { project: "pooled-engine", feature: "GPU autoscaling guardrails" },
    { project: "ask-me-cutely", feature: "Emoji tone slider" },
    { project: "VibeLog", feature: "Now-building generated feed" },
    { project: "website-template", feature: "Dark-mode hero section" },
  ];
  let i = 0;
  timers.push(setInterval(() => {
    if (i > 0 && i % script.length === 0) {
      // restart the loop so the demo visibly resets
      session.buildLog = [];
      session.features = 0;
    }
    const step = script[i % script.length]!;
    i++;
    session.features += 1;
    session.prompts += 1 + Math.floor(Math.random() * 2);
    if (Math.random() < 0.35) session.subAgents += 1;
    if (Math.random() < 0.4) state.stats.commits += 1;
    session.nowBuilding = { title: step.feature, mode: "coding" };
    session.buildLog = [{ text: step.feature, ts: new Date().toISOString() }, ...session.buildLog].slice(0, 6);
    // Bubble this project to the top; the rest slide down.
    const moved = state.projects.find((p) => p.name === step.project) ?? { name: step.project, status: "active" as const };
    const rest = state.projects.filter((p) => p.name !== step.project);
    state.projects = [
      { ...moved, status: "active", note: "now" },
      ...rest.map((p, idx) => ({ ...p, status: "idle" as const, note: `${idx * 6 + 4}m ago` })),
    ];
    render();
  }, 4500));
}

export type { Session };
