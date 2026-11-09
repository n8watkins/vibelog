import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

/**
 * Browser-facing guards for the local agent.
 *
 * The agent listens on 0.0.0.0 and trusts loopback callers (the CLI, the Claude
 * Code hook, the dashboard, OBS). A web page open in the streamer's own browser
 * also connects from loopback, so loopback alone is not proof of intent. These
 * checks close the three browser routes into the agent:
 *
 *  1. Cross-site writes: a page can send a CORS "simple" POST (text/plain, no
 *     preflight). Every write must be `application/json` (which a cross-origin
 *     page can only send after a preflight the agent never approves) and, when
 *     the browser says where it came from (Origin / Sec-Fetch-Site), it must be
 *     the agent's own origin.
 *  2. Cross-origin reads: CORS headers go only on the public read-only routes,
 *     so a page cannot read the private dashboard or settings JSON.
 *  3. DNS rebinding: a hostile name that resolves to 127.0.0.1 makes the page
 *     "same-origin" with the agent. Its Host header still carries the hostile
 *     name, so only loopback names, IP literals (which cannot be rebound) and
 *     hosts the owner configured are trusted.
 */

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Lowercased hostname of a Host header (no port, no IPv6 brackets), or null when malformed. */
export function hostnameOf(host: string | undefined): string | null {
  if (typeof host !== "string") return null;
  const h = host.trim().toLowerCase();
  const v6 = /^\[([0-9a-f:.]+)\](?::\d{1,5})?$/.exec(h);
  if (v6) return isIP(v6[1]!) === 6 ? v6[1]! : null;
  const named = /^([a-z0-9.-]+)(?::\d{1,5})?$/.exec(h);
  if (!named) return null;
  const name = named[1]!.replace(/\.$/, "");
  return name || null;
}

/**
 * True when the Host header names this machine in a way a web page cannot
 * forge through DNS: a loopback name (localhost, *.localhost, 127.0.0.1, ::1),
 * any IP literal (a LAN address, e.g. Windows OBS reaching a WSL agent), or a
 * host the owner listed in `allowedHosts` in ~/.vibelog/config.json.
 * A missing Host only happens outside browsers (HTTP/1.0 tools), so it passes.
 */
export function isAllowedHost(host: string | undefined, extraHosts: readonly string[] = []): boolean {
  if (host === undefined || host === "") return true;
  const name = hostnameOf(host);
  if (!name) return false;
  if (LOOPBACK_NAMES.has(name) || name.endsWith(".localhost")) return true;
  if (isIP(name)) return true;
  return extraHosts.some((x) => x.trim().toLowerCase().replace(/\.$/, "") === name);
}

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Media type of a Content-Type header, lowercased and without parameters. */
function mediaType(ct: string | undefined): string {
  return (ct ?? "").split(";")[0]!.trim().toLowerCase();
}

export type WriteRejection = { status: 403 | 415; error: string };

/**
 * Decide whether a state-changing request (anything but GET/HEAD) may proceed.
 * Returns null to allow it, or the status and reason to refuse with.
 *
 * The CLI, the hook and the MCP server send `application/json` with no Origin,
 * and the dashboard sends it with its own origin, so all of them pass.
 */
export function checkWrite(headers: IncomingHttpHeaders): WriteRejection | null {
  if (mediaType(first(headers["content-type"])) !== "application/json") {
    return { status: 415, error: "writes must be application/json" };
  }
  const site = first(headers["sec-fetch-site"]);
  if (site !== undefined && site !== "same-origin" && site !== "none") {
    return { status: 403, error: "cross-site request refused" };
  }
  const origin = first(headers["origin"]);
  if (origin !== undefined) {
    const host = first(headers["host"]);
    if (!host || origin.toLowerCase() !== `http://${host.toLowerCase()}`) {
      return { status: 403, error: "cross-origin request refused" };
    }
  }
  return null;
}
