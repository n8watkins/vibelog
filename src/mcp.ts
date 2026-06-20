/**
 * VibeLog MCP server — read state + apply themes.
 *
 * Talk to VibeLog from Claude Desktop. Tools:
 *  - get_state    (read)  — the current LiveState snapshot.
 *  - list_presets (read)  — the built-in theme presets you can apply.
 *  - set_theme    (write) — re-skin the overlay/pages live.
 *
 * Safety notes:
 *  - Local stdio transport only — this opens NO network listener of its own.
 *  - Reads surface only the already-public, already-redacted snapshot the agent
 *    serves at GET /state.json. No secrets, paths, prompts, or diffs.
 *  - Writes go through the agent's LOCALHOST-ONLY POST /api/settings route, so
 *    every value is re-validated/allowlisted server-side by validateVars — the
 *    MCP tool cannot bypass it or write anything the dashboard couldn't.
 *  - Built on the low-level Server API to avoid pulling zod into our deps.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import { DEFAULT_PORT, STATE_FILE } from "./config.ts";
import { readSession } from "./store.ts";
import { PRESETS, type Theme, type ThemeVars } from "./theme.ts";
import type { LiveState } from "./state.ts";

export type LoadStateOptions = {
  /** Port the running agent serves /state.json on. Defaults to DEFAULT_PORT. */
  port?: number;
  /** Path to the cached state file fallback. Defaults to STATE_FILE. */
  stateFile?: string;
  /** How long to wait for the agent before falling back to disk. */
  timeoutMs?: number;
};

export type LoadStateResult =
  | { ok: true; source: "agent" | "file"; state: LiveState }
  | { ok: false; message: string };

/**
 * Load the current LiveState, preferring the live agent and falling back to the
 * cached file on disk. Kept side-effect-free (no stdio wiring) so it's testable.
 */
export async function loadState(opts: LoadStateOptions = {}): Promise<LoadStateResult> {
  const port = opts.port ?? DEFAULT_PORT;
  const stateFile = opts.stateFile ?? STATE_FILE;
  const timeoutMs = opts.timeoutMs ?? 1500;

  // 1) Prefer the running agent's public snapshot.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state.json`, { signal: ctrl.signal });
      if (res.ok) {
        const state = (await res.json()) as LiveState;
        return { ok: true, source: "agent", state };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Agent not running / unreachable — fall through to the disk cache.
  }

  // 2) Fall back to the last cached snapshot on disk.
  try {
    const raw = await readFile(stateFile, "utf8");
    const state = JSON.parse(raw) as LiveState;
    return { ok: true, source: "file", state };
  } catch {
    // No cache either.
  }

  // 3) Nothing to show.
  return {
    ok: false,
    message: "VibeLog agent not running and no cached state found — run `vibe start`.",
  };
}

/**
 * Build the theme patch to POST to /api/settings from a set_theme request. Pure
 * + testable; the agent re-validates `shared` via validateVars on receipt.
 *
 *  - `preset` (a known id) → full replace with that preset's vars + presetId.
 *  - `vars`               → merged OVER the current shared theme (preserves the
 *                            rest); used alone, or layered on top of a preset.
 *  - preset + vars        → the result is a customized look, so presetId is
 *                            cleared (it's no longer "that preset").
 *
 * Throws on an unknown preset id (the caller turns this into a helpful message).
 */
export function buildThemePatch(
  args: { preset?: string; vars?: Record<string, string> },
  presets: Theme[],
  currentShared: ThemeVars,
): { shared: ThemeVars; presetId?: string } {
  let base: ThemeVars;
  let presetId: string | undefined;

  if (args.preset) {
    const p = presets.find((x) => x.id === args.preset);
    if (!p) {
      throw new Error(
        `Unknown preset "${args.preset}". Available: ${presets.map((x) => x.id).join(", ")}`,
      );
    }
    base = { ...p.vars };
    presetId = p.id;
  } else {
    base = { ...currentShared };
  }

  const vars = args.vars && typeof args.vars === "object" ? args.vars : {};
  const shared = { ...base, ...vars };

  // Custom vars layered on a preset → no longer that preset (UI highlight off).
  if (presetId && Object.keys(vars).length) presetId = undefined;

  return presetId ? { shared, presetId } : { shared };
}

/** The active agent port (honors `vibe start --port <n>`), else the default. */
async function agentPort(): Promise<number> {
  const session = await readSession().catch(() => null);
  return session?.port ?? DEFAULT_PORT;
}

/** GET the current shared theme from the running agent (localhost only). */
async function getCurrentShared(port: number): Promise<ThemeVars> {
  const res = await fetch(`http://127.0.0.1:${port}/api/settings.json`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`agent returned HTTP ${res.status}`);
  const data = (await res.json()) as { theme?: { shared?: ThemeVars } };
  return data?.theme?.shared ?? {};
}

/** POST a settings patch to the running agent (localhost only). */
async function postSettings(port: number, body: unknown): Promise<{ theme?: { shared?: ThemeVars } }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`agent returned HTTP ${res.status}`);
  return res.json() as Promise<{ theme?: { shared?: ThemeVars } }>;
}

const text = (s: string, isError = false) => ({ content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) });

/** Build the MCP server with the read + theme-write tools registered. */
export function createServer(): Server {
  const server = new Server(
    { name: "vibelog", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_state",
        description:
          "Get VibeLog's current live coding/streaming state (stats, what's being built, live status, theme).",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      {
        name: "list_presets",
        description: "List VibeLog's built-in theme presets (id + name) you can pass to set_theme.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      {
        name: "set_theme",
        description:
          "Re-skin the VibeLog overlay/pages live. Pass `preset` (an id from list_presets) and/or " +
          '`vars` (a map of CSS custom properties, e.g. {"--accent":"#ff8800"}). Requires the agent ' +
          "to be running (`vibe start`). All values are validated/allowlisted by the agent.",
        inputSchema: {
          type: "object",
          properties: {
            preset: { type: "string", description: "A preset id (see list_presets)." },
            vars: {
              type: "object",
              additionalProperties: { type: "string" },
              description: 'CSS custom properties to set, e.g. {"--accent":"#ff8800","--bg":"#07060e"}.',
            },
          },
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    if (name === "get_state") {
      const result = await loadState({ port: await agentPort() });
      return result.ok ? text(JSON.stringify(result.state, null, 2)) : text(result.message);
    }

    if (name === "list_presets") {
      return text(JSON.stringify(PRESETS.map((p) => ({ id: p.id, name: p.name })), null, 2));
    }

    if (name === "set_theme") {
      const preset = typeof args.preset === "string" ? args.preset : undefined;
      const vars =
        args.vars && typeof args.vars === "object" && !Array.isArray(args.vars)
          ? (args.vars as Record<string, string>)
          : undefined;

      if (!preset && !vars) {
        return text("Provide a `preset` id (see list_presets) and/or a `vars` object.", true);
      }
      if (preset && !PRESETS.some((p) => p.id === preset)) {
        return text(`Unknown preset "${preset}". Available: ${PRESETS.map((p) => p.id).join(", ")}`, true);
      }

      try {
        const port = await agentPort();
        // Only need the current theme when merging vars without a preset base.
        const currentShared = preset ? {} : await getCurrentShared(port);
        const patch = buildThemePatch({ preset, vars }, PRESETS, currentShared);
        const result = await postSettings(port, { theme: patch });
        const applied = result?.theme?.shared ?? patch.shared;
        return text(
          `Theme applied${preset ? ` (preset: ${preset})` : ""}. Active shared vars:\n` +
            JSON.stringify(applied, null, 2),
        );
      } catch (err) {
        return text(
          `Couldn't apply theme: ${err instanceof Error ? err.message : String(err)}. Is \`vibe start\` running?`,
          true,
        );
      }
    }

    return text(`Unknown tool: ${name}`, true);
  });

  return server;
}

/** Wire the server to stdio and start serving. Returns once connected. */
export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the server when run directly (e.g. `tsx src/mcp.ts` or `vibe mcp`);
// importing this module for tests must NOT open a transport.
const invokedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  runServer().catch((err: unknown) => {
    // Log only the message — never token/secret values, never the full request.
    console.error(`vibe mcp failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
