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
import { appendEvent, readConfig, readSession, readSettings, writeSession, writeSettings, writeState, type Session } from "./store.ts";
import { PRESETS, resolveTheme, sanitizeProfile, sanitizeSummarizer, validateVars, type Settings } from "./theme.ts";
import { isShareKind, renderCardPng, shareCardSvg, timeLiveLabel, type ShareData } from "./share.ts";
import { beginAuth, completeAuth, disconnect, integrationStatus, isProvider } from "./oauth.ts";
import { demoDashboard, demoToday, demoWeek, demoSocialGrowth } from "./demodata.ts";
import { getProjectActivity, type ProjectActivity } from "./projects.ts";
import { summarize, detectLocalLLM } from "./summarize.ts";
import { connectOBS, type OBSHandle } from "./obs.ts";
import { streamMinutesByDay } from "./stream.ts";
import { readSecrets } from "./secrets.ts";
import { createPublisher, noopPublisher, type Publisher, type Snapshot } from "./publish.ts";
import { fetchSocial, socialGrowth } from "./social.ts";

const GIT_POLL_MS = 5_000;
const TOKEN_POLL_MS = 30_000;
const SOCIAL_POLL_MS = 180_000;

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const OVERLAY_FILE = path.join(PUBLIC_DIR, "overlay.html");
const LIVE_FILE = path.join(PUBLIC_DIR, "live.html");
const LANDING_FILE = path.join(PUBLIC_DIR, "landing.html");
const SHARE_FILE = path.join(PUBLIC_DIR, "share.html");
const EMBED_FILE = path.join(PUBLIC_DIR, "embed.html");
const EMBED_JS_FILE = path.join(PUBLIC_DIR, "embed.js");
const DASHBOARD_FILE = path.join(PUBLIC_DIR, "dashboard.html");
const SHOTS_DIR = path.join(PUBLIC_DIR, "shots");
// Allowlisted product screenshots used by the landing page (and the OG image).
// Exact basenames only — no path traversal, no arbitrary static serving.
const SHOT_FILES = new Set(["overlay.png", "live.png", "dashboard.png"]);

/**
 * Routes a remote viewer is allowed to see. The agent binds 0.0.0.0 and
 * `vibe share` tunnels the *whole* port, so we must gate everything else:
 * only these read-only GET routes are safe to expose. Writes (mark/building/
 * end/hooks) and the private /dashboard are localhost-only — see isRemote().
 */
const PUBLIC_GET_ROUTES = new Set([
  "/", "/overlay", "/live", "/landing", "/state.json",
  // The shareable public page (G1) + its server-rendered OG/Twitter card image
  // (G2). Both must be reachable by remote viewers and unfurl bots. The page is
  // read-only HTML and the card is a PNG rendered from already-public data only
  // (the four profile fields + numeric LiveState stats + theme vars) — see
  // src/share.ts. The "?kind=" query is matched on pathname, so it's covered.
  "/share", "/share/card.png",
  // Embeddable widget (G4): the compact live card hosted in an <iframe> on the
  // user's own site, plus the loader script that injects it. Both are read-only
  // and render only the already-public snapshot surface (same data as /live) —
  // /embed.js is origin-agnostic JS, /embed is the widget HTML. No write, no key.
  "/embed", "/embed.js",
  // Static product screenshots shown on the landing page + used as the OG image,
  // so they must be fetchable by remote/unfurl bots. Read-only PNGs only.
  "/shots/overlay.png", "/shots/live.png", "/shots/dashboard.png",
  // The overlay runs in OBS with no auth, so it must be able to read its theme
  // and the preset list publicly. Only the resolved theme vars are exposed —
  // never profile/integration/secret data. Writes (POST /api/settings) stay
  // localhost-only by NOT being listed here.
  "/api/theme.json", "/api/presets.json",
  // The public /live page renders the user's profile (display name, bio, channel
  // header, Twitter). These four fields are user-typed and intentionally public;
  // sanitised + length-capped, never any integration/secret data.
  "/api/profile.json",
]);

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
 * The public origin to use when building absolute URLs (og:image must be
 * absolute for unfurl bots). Behind `vibe share`'s Cloudflare Tunnel the real
 * public host/proto arrive as forwarding headers; locally we fall back to the
 * Host header. Only host-shaped values are trusted (no path/scheme injection).
 */
export function originOf(
  req: { headers: IncomingMessage["headers"] },
  fallbackPort: number,
): string {
  const h = req.headers;
  const fwdHost = h["x-forwarded-host"];
  const host =
    (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ||
    (typeof h.host === "string" ? h.host : "") ||
    `localhost:${fallbackPort}`;
  const fwdProto = h["x-forwarded-proto"];
  const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(",")[0]?.trim() ||
    (h["cf-ray"] ? "https" : "http");
  // Guard: a Host header can only be host[:port] — reject anything with a slash
  // or whitespace so it can never smuggle a scheme/path into our absolute URLs.
  const safeHost = /^[a-z0-9.:\-]+$/i.test(host) ? host : `localhost:${fallbackPort}`;
  return `${proto === "https" ? "https" : "http"}://${safeHost}`;
}

/** HTML-attribute/text escape for values injected into the share page meta. */
function htmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  let publisher: Publisher = noopPublisher;
  let publishEnabled = false;

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
    // Snapshot publish — non-blocking; throttle+dedup inside the publisher.
    // Skip building the snapshot entirely when no publisher is configured
    // (the common case) so render() stays a cheap local-only operation.
    if (publishEnabled) {
      void buildSnapshot().then((snap) => publisher.tick(snap, { live: state.isLive }));
    }
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

  // ---- share cards (G1/G2) -------------------------------------------------

  /**
   * Assemble the data a share card / page renders from. Pulls ONLY already-public
   * surface: the sanitised profile fields, the public numeric LiveState stats,
   * and the resolved (allowlist-validated) theme vars for the live page. No
   * paths, prompts, tokens or secrets ever reach here.
   */
  async function buildShareData(): Promise<ShareData> {
    const settings = await readSettings();
    const profile = sanitizeProfile(settings?.profile);
    const s = state.stats;
    return {
      displayName: profile.displayName || "VibeLog",
      channelHeader: profile.channelHeader,
      bio: profile.bio,
      twitter: profile.twitter,
      live: state.streaming && state.isLive,
      nowBuilding: state.isLive ? state.nowBuilding?.title : undefined,
      stats: {
        features: s.features,
        commits: s.commits,
        tokens: s.claudeTokens,
        timeLive: state.isLive ? timeLiveLabel(state.startedAt) : "—",
      },
      theme: resolveTheme(settings, "live"),
    };
  }

  /**
   * Build the frozen snapshot the publisher POSTs — exactly the three fields
   * that public/live.html fetches: state, profile, theme. No prompts, paths,
   * diffs, or secrets ever appear here (SNAPSHOT_CONTRACT.md invariant).
   */
  async function buildSnapshot(): Promise<Snapshot> {
    const settings = await readSettings();
    return {
      state,
      profile: sanitizeProfile(settings?.profile),
      theme: resolveTheme(settings, "live"),
    };
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

      // Embeddable widget (G4). The compact live card, rendered in an <iframe>
      // on the user's own site. Same public data contract as /live (state +
      // profile + theme). Adds no inbound write surface.
      if (req.method === "GET" && route === "/embed") {
        const html = await readFile(EMBED_FILE, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }

      // The loader script the user drops on their site (<script src=…/embed.js>).
      // It derives the widget origin from its own src and injects the iframe, so
      // the same file works from localhost / *.workers.dev / a custom domain.
      if (req.method === "GET" && route === "/embed.js") {
        const js = await readFile(EMBED_JS_FILE, "utf8");
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=300",
        });
        res.end(js);
        return;
      }

      // Static marketing landing page (X2). No live data, fully public.
      if (req.method === "GET" && route === "/landing") {
        const html = await readFile(LANDING_FILE, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(html);
        return;
      }

      // Product screenshots for the landing page / OG image. Allowlisted
      // basenames only (see SHOT_FILES) so this can't serve arbitrary files.
      if (req.method === "GET" && route.startsWith("/shots/")) {
        const name = route.slice("/shots/".length);
        if (!SHOT_FILES.has(name)) { sendJson(res, 404, { error: "not found" }); return; }
        const buf = await readFile(path.join(SHOTS_DIR, name));
        res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=3600" });
        res.end(buf);
        return;
      }

      // Shareable public page (G1). Themed like /live, with server-rendered OG /
      // Twitter meta so links unfurl. Display name + description come from the
      // public profile; the og:image is an absolute URL to the card PNG below.
      if (req.method === "GET" && route === "/share") {
        const html = await readFile(SHARE_FILE, "utf8");
        const sd = await buildShareData();
        const origin = originOf(req, port);
        const title = `${sd.displayName} · VibeLog`;
        const desc =
          sd.bio || sd.channelHeader || "Live coding, streamed. Watch what I'm building in real time.";
        const filled = html
          .replaceAll("{{ORIGIN}}", htmlEscape(origin))
          .replaceAll("{{OG_TITLE}}", htmlEscape(title))
          .replaceAll("{{OG_DESC}}", htmlEscape(desc))
          .replaceAll("{{DISPLAY_NAME}}", htmlEscape(sd.displayName));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(filled);
        return;
      }

      // Server-rendered share card image (G2) — the OG/Twitter image. `?kind=`
      // picks "stats" (today's numbers) or "join" (invite). PNG, rendered from
      // public data only (see buildShareData + src/share.ts).
      if (req.method === "GET" && route === "/share/card.png") {
        const kindParam = url.searchParams.get("kind") ?? "stats";
        const kind = isShareKind(kindParam) ? kindParam : "stats";
        const png = renderCardPng(shareCardSvg(kind, await buildShareData()));
        res.writeHead(200, {
          "content-type": "image/png",
          // Short cache: unfurl bots fetch once, but stats change through a session.
          "cache-control": "public, max-age=300",
        });
        res.end(png);
        return;
      }

      if (req.method === "GET" && route === "/state.json") {
        sendJson(res, 200, state);
        return;
      }

      // Resolved theme vars for a page — public so the overlay (in OBS, no auth)
      // can skin itself. Only allowlisted CSS-var values are ever returned.
      if (req.method === "GET" && route === "/api/theme.json") {
        const page = url.searchParams.get("page") ?? "overlay";
        const vars = resolveTheme(await readSettings(), page);
        sendJson(res, 200, { vars });
        return;
      }

      // The curated preset list for the dashboard's theme picker (color data only).
      if (req.method === "GET" && route === "/api/presets.json") {
        sendJson(res, 200, { presets: PRESETS });
        return;
      }

      // The user's public profile (display name / bio / channel header / Twitter)
      // for the /live page. PUBLIC — but only the four sanitised, user-typed
      // profile fields are returned; integrations/secrets never travel here.
      if (req.method === "GET" && route === "/api/profile.json") {
        const s = await readSettings();
        sendJson(res, 200, { profile: sanitizeProfile(s?.profile) });
        return;
      }

      // Full persisted theme settings (sync flag + shared + per-page themes) for
      // the dashboard's Settings sheet. LOCALHOST ONLY — not in PUBLIC_GET_ROUTES,
      // so the isRemote gate above 403s any tunneled/LAN caller. Only the `theme`
      // sub-tree is returned; profile/integrations/secrets are never exposed.
      if (req.method === "GET" && route === "/api/settings.json") {
        const s = await readSettings();
        const theme = s?.theme ?? { sync: true, shared: {} };
        sendJson(res, 200, {
          theme,
          profile: sanitizeProfile(s?.profile),
          // Non-secret summarizer config (provider / local baseUrl / model). The
          // Gemini API key is NOT here — it lives in secrets.json and is never
          // exposed over any route.
          summarizer: sanitizeSummarizer(s?.summarizer),
          integrations: await integrationStatus(),
        });
        return;
      }

      // Auto-detect a localhost OpenAI-compatible model (Ollama :11434 /
      // LM Studio :1234) for the Summarizer settings UI. LOCALHOST ONLY — not in
      // PUBLIC_GET_ROUTES, so the isRemote gate above 403s any tunneled/LAN
      // caller. Only probes loopback ports; returns non-secret { baseUrl, model }.
      if (req.method === "GET" && route === "/api/summarizer/detect.json") {
        sendJson(res, 200, { detected: await detectLocalLLM() });
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

      // Persist theme settings. POST + not in PUBLIC_GET_ROUTES, so the isRemote
      // gate above already 403s any tunneled/LAN caller — writes are localhost
      // only. Every theme value is validated/allowlisted before it's stored.
      if (req.method === "POST" && route === "/api/settings") {
        const body = await readBody(req);
        const incoming = (body.theme ?? {}) as Record<string, unknown>;
        const current = (await readSettings()) ?? { version: 1 as const, theme: { sync: true, shared: {} } };
        const theme = current.theme ?? { sync: true, shared: {} };
        if (typeof incoming.sync === "boolean") theme.sync = incoming.sync;
        if (typeof incoming.presetId === "string") theme.presetId = incoming.presetId.slice(0, 64);
        if (incoming.shared) theme.shared = validateVars(incoming.shared);
        if (incoming.perPage && typeof incoming.perPage === "object") {
          theme.perPage = theme.perPage ?? {};
          for (const p of ["overlay", "live", "dashboard"] as const) {
            const pv = (incoming.perPage as Record<string, unknown>)[p];
            if (pv) theme.perPage[p] = validateVars(pv);
          }
        }
        // Profile patch (display name / bio / channel header / Twitter). Merged
        // over the existing profile and sanitised; only known keys survive.
        let profile = current.profile;
        if (body.profile && typeof body.profile === "object") {
          profile = sanitizeProfile({ ...current.profile, ...(body.profile as object) });
        }
        // Summarizer patch (provider / local baseUrl / model). Non-secret and
        // merged over the existing config; baseUrl is loopback-only after
        // sanitising, so a write can't point the agent at a remote URL. The
        // Gemini key is never accepted here — it lives in secrets.json.
        let summarizer = current.summarizer;
        if (body.summarizer && typeof body.summarizer === "object") {
          summarizer = sanitizeSummarizer({ ...current.summarizer, ...(body.summarizer as object) });
        }
        const next: Settings = { ...current, version: 1, theme, profile, summarizer };
        await writeSettings(next);
        return sendJson(res, 200, { ok: true, theme: next.theme, profile: next.profile ?? {}, summarizer: next.summarizer ?? {} });
      }

      // ── Integrations OAuth (S3) — all localhost-only ──────────────────────
      // POST /start and /disconnect aren't GETs, and the GET /callback isn't in
      // PUBLIC_GET_ROUTES, so the isRemote() gate already 403s any remote caller.
      // Tokens are written only to chmod-600 files; the dashboard only ever sees
      // derived { connected, configured, login } — see src/oauth.ts.

      // Begin a connect flow → returns the provider's authorize URL.
      if (req.method === "POST" && route.startsWith("/api/oauth/") && route.endsWith("/start")) {
        const p = route.slice("/api/oauth/".length, -"/start".length);
        if (!isProvider(p)) return sendJson(res, 404, { error: "unknown provider" });
        try {
          const redirectUri = `http://localhost:${port}/oauth/${p}/callback`;
          const authorizeUrl = await beginAuth(p, redirectUri);
          return sendJson(res, 200, { url: authorizeUrl });
        } catch (err) {
          return sendJson(res, 400, { error: err instanceof Error ? err.message : "cannot start" });
        }
      }

      // Disconnect a provider → deletes its stored token.
      if (req.method === "POST" && route.startsWith("/api/oauth/") && route.endsWith("/disconnect")) {
        const p = route.slice("/api/oauth/".length, -"/disconnect".length);
        if (!isProvider(p)) return sendJson(res, 404, { error: "unknown provider" });
        await disconnect(p);
        return sendJson(res, 200, { ok: true, integrations: await integrationStatus() });
      }

      // OAuth redirect target. Verifies state, exchanges the code, stores the
      // token, and returns a tiny page that closes itself so the dashboard
      // (which polls integration status) picks up the new connection.
      if (req.method === "GET" && route.startsWith("/oauth/") && route.endsWith("/callback")) {
        const p = route.slice("/oauth/".length, -"/callback".length);
        const sendHtml = (status: number, msg: string, ok: boolean): void => {
          const color = ok ? "#22d3a6" : "#ff8a8a";
          res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end(
            "<!doctype html><meta charset=utf-8><title>VibeLog</title>" +
              "<body style=\"font:15px system-ui;background:#07060e;color:#e9e2ff;display:grid;place-items:center;height:100vh;margin:0\">" +
              `<div style="text-align:center"><div style="font-size:38px;color:${color}">${ok ? "✓" : "!"}</div>` +
              `<p>${msg}</p><p style="color:#a99fce;font-size:13px">You can close this tab.</p></div>` +
              "<script>setTimeout(function(){try{window.close()}catch(e){}},1200)</script>",
          );
        };
        if (!isProvider(p)) return sendHtml(404, "Unknown provider.", false);
        const err = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (err) return sendHtml(400, `${p} authorization was denied.`, false);
        if (!code || !state) return sendHtml(400, "Missing authorization code.", false);
        try {
          const redirectUri = `http://localhost:${port}/oauth/${p}/callback`;
          const r = await completeAuth(code, state, redirectUri);
          return sendHtml(200, `Connected ${r.provider}${r.login ? ` as ${r.login}` : ""}.`, true);
        } catch (e) {
          // Never surface token internals — a short reason only.
          return sendHtml(400, `Couldn't connect ${p}. ${e instanceof Error ? e.message : ""}`.trim(), false);
        }
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
    // Set up snapshot publisher if configured (url + token present in secrets).
    const secrets = await readSecrets();
    const pubCfg = secrets.publish;
    if (pubCfg?.url && pubCfg?.token) {
      publisher = createPublisher({
        url: pubCfg.url,
        token: pubCfg.token,
        liveCadenceSec: pubCfg.liveCadenceSec,
        idleCadenceSec: pubCfg.idleCadenceSec,
      });
      publishEnabled = true;
      // Initial publish — buildSnapshot() runs after the first pollers below
      // so defer it until after the await pollGit() call.
    }

    await pollGit();
    void pollTokens();
    void refreshHistory();
    void connectStreamCapture();
    void pollSocial();
    timers.push(setInterval(() => void pollGit(), GIT_POLL_MS));
    timers.push(setInterval(() => void pollTokens(), TOKEN_POLL_MS));
    timers.push(setInterval(() => void refreshHistory(), 60_000));
    timers.push(setInterval(() => void pollSocial(), SOCIAL_POLL_MS));

    // Initial publish (after first git poll so stats are populated).
    if (publishEnabled) {
      void buildSnapshot().then((snap) => publisher.publishNow(snap));
      // Safety-net: republish on the idle cadence even when state is quiet.
      const idleSec = pubCfg?.idleCadenceSec ?? 900;
      timers.push(setInterval(
        () => void buildSnapshot().then((snap) => publisher.tick(snap, { live: state.isLive })),
        idleSec * 1000,
      ));
    }
  }

  const shutdown = async () => {
    timers.forEach(clearInterval);
    obs?.close();
    state.isLive = false;
    void writeState(state);
    // Best-effort final publish (state is now offline). Give the POST a brief
    // window to land, but never let it block shutdown past the timeout.
    if (publishEnabled) {
      try {
        const snap = await buildSnapshot();
        await Promise.race([
          publisher.publishNow(snap),
          new Promise<void>((r) => setTimeout(r, 1500)),
        ]);
      } catch {
        // never block a clean exit on the publisher
      }
    }
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
