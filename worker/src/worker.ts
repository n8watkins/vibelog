/**
 * VibeLog Cloudflare Worker — PR3 (Task C)
 *
 * Stores the published snapshot in KV and serves the public /live page 24/7.
 *
 * Bindings (declared in wrangler.toml):
 *   SNAPSHOTS    — KV namespace for the snapshot
 *   PUBLISH_TOKEN — secret (set via `wrangler secret put PUBLISH_TOKEN`)
 *
 * Routes:
 *   POST /publish              — ingest a new snapshot (token-gated)
 *   GET  /state.json           — snapshot.state verbatim
 *   GET  /api/profile.json     — { profile: snapshot.profile }
 *   GET  /api/theme.json       — { vars: snapshot.theme } (ignores ?page=)
 *   GET  /                     — live.html (served via static assets binding)
 *   GET  /live                 — live.html (served via static assets binding)
 *
 * Security notes:
 *   - Only POST /publish writes; it is token-gated with a constant-time compare.
 *   - All GETs are public read-only; the snapshot surface contains no secrets.
 *   - PUBLISH_TOKEN is never logged.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  /** KV namespace for the snapshot. */
  SNAPSHOTS: KVNamespace;
  /** Secret token checked on POST /publish. Set via `wrangler secret put`. */
  PUBLISH_TOKEN: string;
  /** Static assets binding — serves files from worker/public/. */
  ASSETS: Fetcher;
}

/** The shape written by POST /publish and read back on GET routes. */
interface Snapshot {
  state: Record<string, unknown>;
  profile: Record<string, unknown>;
  theme: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** KV key for the single-user MVP snapshot. */
export const SNAPSHOT_KEY = "snapshot:nate";

/**
 * Constant-time string equality — prevents timing attacks on the token compare.
 *
 * Algorithm:
 *   1. If lengths differ, still compare a dummy pair so timing is consistent,
 *      then return false. (Do NOT early-return on length mismatch alone.)
 *   2. Walk the longer of the two strings char-by-char, XOR-accumulating
 *      differences so no short-circuit is possible.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  // Determine a fixed iteration count based on the longer string.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length; // non-zero if lengths differ
  for (let i = 0; i < len; i++) {
    // Use 0 as a stand-in for out-of-bounds chars; both sides get 0 if both
    // are short, which XORs to 0 (no spurious diff for equal short strings).
    const ca = a.charCodeAt(i) || 0;
    const cb = b.charCodeAt(i) || 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/** Route kinds understood by this worker. */
export type RouteKind =
  | "publish"
  | "state"
  | "profile"
  | "theme"
  | "page"
  | "not_found";

/**
 * Map (method, pathname) → RouteKind.
 * Pure; usable in tests without a live Worker runtime.
 */
export function routeKind(method: string, pathname: string): RouteKind {
  const m = method.toUpperCase();
  // Normalise trailing slash for comparison, but keep "/" itself.
  const p = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

  if (m === "POST" && p === "/publish") return "publish";
  if (m === "GET" && p === "/state.json") return "state";
  if (m === "GET" && p === "/api/profile.json") return "profile";
  if (m === "GET" && p === "/api/theme.json") return "theme";
  if (m === "GET" && (p === "/" || p === "/live")) return "page";
  return "not_found";
}

// ---------------------------------------------------------------------------
// Snapshot field extractors (exported for unit tests)
// ---------------------------------------------------------------------------

export function extractState(snap: Snapshot): string {
  return JSON.stringify(snap.state ?? {});
}

export function extractProfile(snap: Snapshot): string {
  return JSON.stringify({ profile: snap.profile ?? {} });
}

export function extractTheme(snap: Snapshot): string {
  return JSON.stringify({ vars: snap.theme ?? {} });
}

// ---------------------------------------------------------------------------
// Cold/empty defaults (returned when KV has no snapshot yet)
// ---------------------------------------------------------------------------

const EMPTY_STATE = JSON.stringify({});
const EMPTY_PROFILE = JSON.stringify({ profile: {} });
const EMPTY_THEME = JSON.stringify({ vars: {} });

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=30",
} as const;

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: JSON_HEADERS });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// POST /publish handler
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 256 * 1024; // 256 KB

async function handlePublish(request: Request, env: Env): Promise<Response> {
  // 1. Token check — constant-time compare
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!timingSafeEqualStr(token, env.PUBLISH_TOKEN)) {
    return errorResponse(403, "Forbidden");
  }

  // 2. Size cap — reject oversized bodies before reading them
  const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return errorResponse(413, "Payload too large");
  }

  // 3. Read + parse body
  let bodyText: string;
  try {
    // Clone and consume with a size guard — even if Content-Length is absent/wrong
    const reader = request.body?.getReader();
    if (!reader) return errorResponse(400, "Empty body");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          return errorResponse(413, "Payload too large");
        }
        chunks.push(value);
      }
    }
    bodyText = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.byteLength + c.byteLength);
        merged.set(acc, 0);
        merged.set(c, acc.byteLength);
        return merged;
      }, new Uint8Array(0))
    );
  } catch {
    return errorResponse(400, "Failed to read body");
  }

  // 4. Parse JSON + sanity-check structure
  let snapshot: Snapshot;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("state" in parsed) ||
      !("profile" in parsed) ||
      !("theme" in parsed)
    ) {
      return errorResponse(400, "Body must be JSON with state, profile, theme fields");
    }
    snapshot = parsed as Snapshot;
  } catch {
    return errorResponse(400, "Invalid JSON");
  }

  // 5. Write to KV
  await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(snapshot));

  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// GET handlers (read from KV)
// ---------------------------------------------------------------------------

async function getSnapshot(env: Env): Promise<Snapshot | null> {
  const raw = await env.SNAPSHOTS.get(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const kind = routeKind(request.method, url.pathname);

    // CORS pre-flight for GET routes (unlikely but tidy)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    switch (kind) {
      case "publish":
        return handlePublish(request, env);

      case "state": {
        const snap = await getSnapshot(env);
        const body = snap ? extractState(snap) : EMPTY_STATE;
        return jsonResponse(body);
      }

      case "profile": {
        const snap = await getSnapshot(env);
        const body = snap ? extractProfile(snap) : EMPTY_PROFILE;
        return jsonResponse(body);
      }

      case "theme": {
        const snap = await getSnapshot(env);
        const body = snap ? extractTheme(snap) : EMPTY_THEME;
        return jsonResponse(body);
      }

      case "page": {
        // Serve live.html from static assets binding.
        // Rewrite both "/" and "/live" to "/live.html" so Wrangler finds the file.
        const assetUrl = new URL(request.url);
        assetUrl.pathname = "/live.html";
        const assetReq = new Request(assetUrl.toString(), request);
        const assetRes = await env.ASSETS.fetch(assetReq);
        // Add cache header to the page response
        const headers = new Headers(assetRes.headers);
        headers.set("Cache-Control", "public, max-age=30");
        return new Response(assetRes.body, {
          status: assetRes.status,
          headers,
        });
      }

      default:
        return errorResponse(404, "Not found");
    }
  },
} satisfies ExportedHandler<Env>;
