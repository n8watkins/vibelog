import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { VIBE_DIR } from "./config.ts";
import { readSecrets, type Secrets } from "./secrets.ts";
import {
  readTwitchTokens,
  writeTwitchTokens,
  TWITCH_TOKENS_FILE,
  type TwitchTokens,
} from "./twitch-oauth.ts";

/**
 * Generic Authorization-Code OAuth for the dashboard Integrations hub: connect /
 * disconnect Twitch, YouTube, Discord and GitHub from the browser. Mirrors the
 * loopback flow in twitch-oauth.ts but runs the callback on the main agent
 * (:4545) so the whole dance happens in one tab.
 *
 * Security posture (docs/INFRA_PLAN.md §4):
 *  - App client_id/client_secret live ONLY in secrets.json (chmod 600).
 *  - Issued tokens live ONLY in chmod-600 files (twitch-tokens.json for Twitch,
 *    oauth-tokens.json for the rest) — never in LiveState/state.json/settings.json,
 *    never logged (presence/length only).
 *  - The dashboard only ever sees a derived { connected, configured, login } —
 *    never a token. The connect/callback/disconnect routes are localhost-only
 *    (POST, or a GET not in PUBLIC_GET_ROUTES → isRemote() 403s any remote caller).
 *  - A random `state` is issued on start and verified on callback (CSRF guard).
 */

export type ProviderId = "twitch" | "youtube" | "discord" | "github";
export const PROVIDERS: ProviderId[] = ["twitch", "youtube", "discord", "github"];

const OAUTH_TOKENS_FILE = path.join(VIBE_DIR, "oauth-tokens.json");
const STATE_TTL_MS = 10 * 60_000; // a pending authorize is valid for ~10 min

/** What the dashboard sees per provider — derived, never the token itself. */
export type IntegrationState = {
  /** A valid token is stored (the account is linked). */
  connected: boolean;
  /** App client id/secret are present in secrets.json (connect is possible). */
  configured: boolean;
  /** Public handle/login of the connected account, if known. */
  login?: string;
};

type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms expiry, when the provider issues one. */
  expiresAt?: number;
  login?: string;
  channelId?: string;
  scope?: string;
};
type OAuthStore = Partial<Record<ProviderId, StoredToken>>;

type ProviderCfg = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Extra authorize-URL params (e.g. Google offline access). */
  authParams?: Record<string, string>;
  creds(s: Secrets): { clientId?: string; clientSecret?: string };
  /** Fetch a display handle (+ channelId) after a successful exchange. */
  identify?(accessToken: string): Promise<{ login?: string; channelId?: string }>;
};

const PROVIDER_CFG: Record<ProviderId, ProviderCfg> = {
  twitch: {
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scope: "moderator:read:followers",
    creds: (s) => ({ clientId: s.twitch?.clientId, clientSecret: s.twitch?.clientSecret }),
    identify: async (token) => {
      const { clientId } = (await readSecrets()).twitch ?? {};
      if (!clientId) return {};
      const r = await fetch("https://api.twitch.tv/helix/users", {
        headers: { authorization: `Bearer ${token}`, "client-id": clientId },
      });
      if (!r.ok) return {};
      const j = (await r.json()) as { data?: Array<{ login?: string; id?: string }> };
      return { login: j.data?.[0]?.login, channelId: j.data?.[0]?.id };
    },
  },
  youtube: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    creds: (s) => ({ clientId: s.youtube?.clientId, clientSecret: s.youtube?.clientSecret }),
    identify: async (token) => {
      const r = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!r.ok) return {};
      const j = (await r.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
      return { login: j.items?.[0]?.snippet?.title, channelId: j.items?.[0]?.id };
    },
  },
  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scope: "identify",
    creds: (s) => ({ clientId: s.discord?.clientId, clientSecret: s.discord?.clientSecret }),
    identify: async (token) => {
      const r = await fetch("https://discord.com/api/users/@me", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!r.ok) return {};
      const j = (await r.json()) as { username?: string; id?: string };
      return { login: j.username, channelId: j.id };
    },
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user",
    creds: (s) => ({ clientId: s.github?.clientId, clientSecret: s.github?.clientSecret }),
    identify: async (token) => {
      const r = await fetch("https://api.github.com/user", {
        headers: { authorization: `Bearer ${token}`, "user-agent": "VibeLog", accept: "application/vnd.github+json" },
      });
      if (!r.ok) return {};
      const j = (await r.json()) as { login?: string; id?: number };
      return { login: j.login, channelId: j.id != null ? String(j.id) : undefined };
    },
  },
};

export function isProvider(x: string): x is ProviderId {
  return (PROVIDERS as string[]).includes(x);
}

// ── token store (chmod 600) ───────────────────────────────────────────────────

async function readStore(): Promise<OAuthStore> {
  try {
    return JSON.parse(await readFile(OAUTH_TOKENS_FILE, "utf8")) as OAuthStore;
  } catch {
    return {};
  }
}

async function writeStore(store: OAuthStore): Promise<void> {
  await mkdir(VIBE_DIR, { recursive: true });
  await writeFile(OAUTH_TOKENS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    const { chmod } = await import("node:fs/promises");
    await chmod(OAUTH_TOKENS_FILE, 0o600);
  } catch {
    // best-effort (e.g. Windows) — the .vibelog dir is already user-private
  }
}

/** Persist a provider's token. Twitch reuses its existing chmod-600 store so the
 *  follower poller in social.ts keeps reading the same file. */
async function persistToken(p: ProviderId, t: StoredToken): Promise<void> {
  if (p === "twitch") {
    const tw: TwitchTokens = {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken ?? "",
      expiresAt: t.expiresAt ?? Date.now() + 3600_000,
      scope: t.scope ?? PROVIDER_CFG.twitch.scope,
    };
    await writeTwitchTokens(tw);
    return;
  }
  const store = await readStore();
  store[p] = t;
  await writeStore(store);
}

// ── status (what the dashboard reads) ─────────────────────────────────────────

/** Derive each provider's { connected, configured, login } from creds + token
 *  presence on disk. Never returns a token. Used by GET /api/settings.json. */
export async function integrationStatus(): Promise<Record<ProviderId, IntegrationState>> {
  const secrets = await readSecrets();
  const [twitchTok, store] = await Promise.all([readTwitchTokens(), readStore()]);
  const out = {} as Record<ProviderId, IntegrationState>;
  for (const p of PROVIDERS) {
    const { clientId, clientSecret } = PROVIDER_CFG[p].creds(secrets);
    const configured = Boolean(clientId && clientSecret);
    if (p === "twitch") {
      out[p] = {
        connected: twitchTok != null,
        configured,
        login: secrets.twitch?.login ?? undefined,
      };
    } else {
      const t = store[p];
      out[p] = { connected: Boolean(t?.accessToken), configured, login: t?.login };
    }
  }
  return out;
}

// ── the flow ──────────────────────────────────────────────────────────────────

/** Pending authorizations (CSRF state → provider), in-memory per process. */
const pending = new Map<string, { provider: ProviderId; at: number }>();

function sweepPending(): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [k, v] of pending) if (v.at < cutoff) pending.delete(k);
}

/**
 * Begin a connect flow: returns the provider's authorize URL (with a fresh CSRF
 * state). Throws if the provider has no client creds in secrets.json.
 */
export async function beginAuth(p: ProviderId, redirectUri: string): Promise<string> {
  const cfg = PROVIDER_CFG[p];
  const { clientId } = cfg.creds(await readSecrets());
  if (!clientId) throw new Error(`${p} is not configured (add clientId/clientSecret to secrets.json)`);
  sweepPending();
  const state = randomBytes(16).toString("hex");
  pending.set(state, { provider: p, at: Date.now() });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.scope,
    state,
    ...(cfg.authParams ?? {}),
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
  error?: string;
  error_description?: string;
};

/**
 * Complete a connect flow from the OAuth redirect: verify the CSRF state,
 * exchange the code for a token, fetch the account handle, and persist the
 * token to its chmod-600 store. Returns the linked provider on success.
 * Never logs token values.
 */
export async function completeAuth(
  code: string,
  state: string,
  redirectUri: string,
): Promise<{ provider: ProviderId; login?: string }> {
  sweepPending();
  const entry = pending.get(state);
  if (!entry) throw new Error("Unknown or expired OAuth state");
  pending.delete(state);
  const p = entry.provider;
  const cfg = PROVIDER_CFG[p];
  const { clientId, clientSecret } = cfg.creds(await readSecrets());
  if (!clientId || !clientSecret) throw new Error(`${p} is not configured`);

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`${p} token exchange failed (HTTP ${res.status})`);
  const j = (await res.json()) as TokenResponse;
  if (!j.access_token) throw new Error(`${p} token exchange returned no access_token`);

  let login: string | undefined;
  let channelId: string | undefined;
  try {
    const id = await cfg.identify?.(j.access_token);
    login = id?.login;
    channelId = id?.channelId;
  } catch {
    // identity lookup is best-effort — the connection still succeeds
  }

  await persistToken(p, {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined,
    scope: Array.isArray(j.scope) ? j.scope.join(" ") : j.scope,
    login,
    channelId,
  });
  return { provider: p, login };
}

/** Remove a provider's stored token (disconnect). Never throws. */
export async function disconnect(p: ProviderId): Promise<void> {
  if (p === "twitch") {
    await rm(TWITCH_TOKENS_FILE, { force: true }).catch(() => {});
    return;
  }
  const store = await readStore();
  if (store[p]) {
    delete store[p];
    await writeStore(store);
  }
}
