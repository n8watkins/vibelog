/**
 * VibeLog MCP server — read-only spike.
 *
 * Talk to VibeLog from Claude Desktop. This is a deliberately small first slice:
 * a stdio MCP server exposing a SINGLE read-only tool (`get_state`) that returns
 * VibeLog's current LiveState. There are NO write/mutating tools yet.
 *
 * Safety notes:
 *  - Local stdio transport only — this opens NO network listener of its own.
 *  - The only data surfaced is the already-public, already-redacted snapshot
 *    that the agent serves at GET /state.json (the same `LiveState` the overlay
 *    and the public /live page read). No secrets, paths, prompts, or diffs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { DEFAULT_PORT, STATE_FILE } from "./config.ts";
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
 * cached file on disk.
 *
 *  1. Try `GET http://127.0.0.1:<port>/state.json` (short timeout).
 *  2. If the agent isn't running / the fetch fails, read STATE_FILE from disk.
 *  3. If neither is available, return a clear, actionable message.
 *
 * Kept side-effect-free (no stdio wiring) so it's unit-testable.
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
      const res = await fetch(`http://127.0.0.1:${port}/state.json`, {
        signal: ctrl.signal,
      });
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

/** Build the MCP server with the single read-only `get_state` tool registered. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "vibelog", version: "0.0.0" });

  server.registerTool(
    "get_state",
    {
      title: "Get VibeLog state",
      description:
        "Get VibeLog's current live coding/streaming state (stats, what's being built, live status, theme).",
      // No input params — empty input schema.
      inputSchema: {},
      // Hint to clients that this tool only reads and never mutates.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const result = await loadState();
      if (!result.ok) {
        return { content: [{ type: "text", text: result.message }] };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result.state, null, 2) }],
      };
    },
  );

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
  typeof process.argv[1] === "string" &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  runServer().catch((err: unknown) => {
    // Log only the message — never token/secret values, never the full request.
    console.error(`vibe mcp failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
