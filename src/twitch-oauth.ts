import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { VIBE_DIR } from "./config.ts";
import { readSecrets } from "./secrets.ts";

/**
 * Twitch broadcaster user-token store + OAuth (Authorization Code, loopback).
 *
 * The app-only token (client_credentials, see social.ts) can read live status +
 * viewer count but NOT follower totals — Helix /channels/followers needs a
 * broadcaster user token with scope moderator:read:followers. This module owns
 * that user token: it runs the one-time login flow and hands social.ts a valid
 * access token (refreshing transparently).
 *
 * Security posture (docs/INFRA_PLAN.md §4): tokens live only in
 * ~/.vibelog/twitch-tokens.json (chmod 600), never in LiveState/state.json,
 * never logged. We only ever log token presence/length, never values.
 */

export const TWITCH_TOKENS_FILE = path.join(VIBE_DIR, "twitch-tokens.json");

/** Loopback redirect for the Authorization Code flow. Localhost only. */
export const REDIRECT_URI = "http://localhost:4546";
const LOGIN_PORT = 4546;
const SCOPE = "moderator:read:followers";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const LOGIN_TIMEOUT_MS = 120_000; // ~2 min, then give up so we never hang forever
const REFRESH_SKEW_MS = 60_000; // refresh when within ~60s of expiry

export type TwitchTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
  scope: string;
};

/** Read the stored user tokens, or null if not yet logged in / unreadable. */
export async function readTwitchTokens(): Promise<TwitchTokens | null> {
  try {
    const data = JSON.parse(await readFile(TWITCH_TOKENS_FILE, "utf8")) as TwitchTokens;
    if (!data?.accessToken || !data?.refreshToken) return null;
    return data;
  } catch {
    return null;
  }
}

/** Persist user tokens to ~/.vibelog/twitch-tokens.json with mode 0600. */
export async function writeTwitchTokens(tokens: TwitchTokens): Promise<void> {
  await mkdir(VIBE_DIR, { recursive: true });
  // mode on writeFile only applies when the file is created; chmod to be sure
  // an existing file is tightened too. Never log the contents.
  await writeFile(TWITCH_TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  await chmod600(TWITCH_TOKENS_FILE);
}

async function chmod600(file: string): Promise<void> {
  try {
    const { chmod } = await import("node:fs/promises");
    await chmod(file, 0o600);
  } catch {
    // best-effort (e.g. Windows) — secrets dir is already user-private
  }
}

/**
 * Pure refresh decision: true when the token is already expired or within
 * REFRESH_SKEW_MS of expiry. Unit-tested (no network in this path).
 */
export function needsRefresh(expiresAt: number, now: number = Date.now()): boolean {
  return expiresAt - now <= REFRESH_SKEW_MS;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
  error?: string;
  message?: string;
};

function tokensFromResponse(j: TokenResponse): TwitchTokens | null {
  if (!j.access_token || !j.refresh_token) return null;
  const scope = Array.isArray(j.scope) ? j.scope.join(" ") : (j.scope ?? SCOPE);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
    scope,
  };
}

/** Exchange a refresh_token for a fresh access token (token rotation). */
async function refresh(clientId: string, clientSecret: string, refreshToken: string): Promise<TwitchTokens | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  return tokensFromResponse((await res.json()) as TokenResponse);
}

/**
 * Return a valid broadcaster access token, refreshing (and persisting the
 * rotated tokens) when near expiry. Returns null if no token is stored or the
 * refresh fails / Twitch creds are missing — callers must degrade gracefully.
 * Never throws; never logs token values.
 */
export async function twitchUserToken(): Promise<string | null> {
  const stored = await readTwitchTokens();
  if (!stored) return null;
  if (!needsRefresh(stored.expiresAt)) return stored.accessToken;

  const { clientId, clientSecret } = (await readSecrets()).twitch ?? {};
  if (!clientId || !clientSecret) return stored.accessToken; // can't refresh; try the existing one
  try {
    const rotated = await refresh(clientId, clientSecret, stored.refreshToken);
    if (!rotated) return null;
    await writeTwitchTokens(rotated);
    return rotated.accessToken;
  } catch {
    return null;
  }
}

/** Best-effort: try to open the authorize URL in a browser. Never fails. */
function tryOpen(url: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  void import("node:child_process")
    .then(({ spawn }) => {
      try {
        const p = spawn(opener, [url], { stdio: "ignore", detached: true });
        p.on("error", () => {});
        p.unref();
      } catch {
        // no browser opener — the URL is already printed for manual use
      }
    })
    .catch(() => {});
}

const SUCCESS_HTML =
  "<!doctype html><meta charset=utf-8><title>VibeLog</title>" +
  "<body style=\"font:16px system-ui;background:#15101e;color:#e9e2ff;display:grid;place-items:center;height:100vh;margin:0\">" +
  "<div style=\"text-align:center\"><div style=\"font-size:40px\">✓</div>" +
  "<p>VibeLog connected to Twitch — you can close this tab.</p></div>";

const ERROR_HTML =
  "<!doctype html><meta charset=utf-8><title>VibeLog</title>" +
  "<body style=\"font:16px system-ui;background:#15101e;color:#ffd2d2;display:grid;place-items:center;height:100vh;margin:0\">" +
  "<div style=\"text-align:center\"><p>VibeLog: Twitch login failed. Check the terminal.</p></div>";

/**
 * Run the one-time Authorization Code login flow with a loopback redirect.
 * Prints the authorize URL, starts a localhost-only server on :4546, exchanges
 * the returned code for tokens, persists them, and resolves. Rejects on error
 * or timeout. Used by `vibe twitch login`.
 */
export async function loginCommand(): Promise<void> {
  const { clientId, clientSecret } = (await readSecrets()).twitch ?? {};
  if (!clientId || !clientSecret) {
    console.error(
      "Twitch clientId/clientSecret are not set.\n" +
        `Add them to ${path.join(os.homedir(), ".vibelog", "secrets.json")}:\n` +
        '  { "twitch": { "clientId": "...", "clientSecret": "...", "login": "yourlogin" } }\n' +
        "Create an app at https://dev.twitch.tv/console/apps with OAuth Redirect URL\n" +
        `  ${REDIRECT_URI}`,
    );
    process.exit(1);
  }

  const authorizeUrl =
    `${AUTHORIZE_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPE)}`;

  await new Promise<void>((resolve, reject) => {
    let done = false;
    const server = http.createServer(async (req, res) => {
      // Ignore favicon and any non-redirect noise.
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");

      if (error) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(ERROR_HTML);
        finish(new Error(`Twitch returned error: ${error} ${url.searchParams.get("error_description") ?? ""}`.trim()));
        return;
      }
      if (!code) {
        // Some browsers hit "/" before the redirect arrives; wait for the real one.
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(ERROR_HTML);
        return;
      }

      try {
        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
          }),
        });
        const j = (await tokenRes.json()) as TokenResponse;
        const tokens = tokenRes.ok ? tokensFromResponse(j) : null;
        if (!tokens) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(ERROR_HTML);
          finish(new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${j.message ?? j.error ?? "unknown"}`));
          return;
        }
        await writeTwitchTokens(tokens);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(SUCCESS_HTML);
        finish(null);
      } catch (err) {
        res.writeHead(500, { "content-type": "text/html; charset=utf-8" }).end(ERROR_HTML);
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    const timer = setTimeout(() => finish(new Error("Timed out waiting for Twitch authorization (2 min).")), LOGIN_TIMEOUT_MS);

    function finish(err: Error | null): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve();
    }

    server.on("error", (err) => finish(err instanceof Error ? err : new Error(String(err))));

    // Bind to loopback only so the redirect server is never reachable off-box.
    server.listen(LOGIN_PORT, "127.0.0.1", () => {
      console.log("\nOpen this URL in your browser and authorize VibeLog:\n");
      console.log("  " + authorizeUrl + "\n");
      console.log(`Waiting for the redirect to ${REDIRECT_URI} (≤ 2 min)…`);
      tryOpen(authorizeUrl);
    });
  });

  console.log("✓ Twitch connected. Follower count will now appear in your stats.");
}
