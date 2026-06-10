import { readSecrets, type Secrets } from "./secrets.ts";
import { twitchUserToken } from "./twitch-oauth.ts";
import { localDateString } from "./ccusage.ts";
import type { VibeEvent } from "./report.ts";
import type { SocialChannel, SocialState } from "./state.ts";

/**
 * Best-effort social stats (live status + audience) for the overlay/dashboard.
 * Reads creds from ~/.vibelog/secrets.json (never the streamed shell). Every
 * call is wrapped — a missing cred or a failed request degrades to "unconfigured"
 * (null) rather than throwing, so self-deployers with no channel still work.
 *
 * Twitch: app access token (client_credentials) → live status + viewer count.
 *   Follower count needs a broadcaster user token w/ moderator:read:followers
 *   (run `vibe twitch login`, stored in ~/.vibelog/twitch-tokens.json). When that
 *   token exists we use it for /users + /channels/followers so `total` returns;
 *   without it we degrade to live + viewers only (no follower count).
 * YouTube: API key → subscriber + view counts (public channel statistics).
 */

const TIMEOUT_MS = 4000;

async function getJson(url: string, headers?: Record<string, string>): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Twitch ---------------------------------------------------------------

let twitchToken: { token: string; exp: number } | null = null;

async function twitchAppToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (twitchToken && Date.now() < twitchToken.exp) return twitchToken.token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    twitchToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000 };
    return j.access_token;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTwitch(s: Secrets): Promise<SocialChannel | null> {
  const { clientId, clientSecret, login } = s.twitch ?? {};
  if (!clientId || !clientSecret || !login) return null;
  const appToken = await twitchAppToken(clientId, clientSecret);
  if (!appToken) return null;
  const appHeaders = { "client-id": clientId, authorization: `Bearer ${appToken}` };

  // Prefer the broadcaster user token (if `vibe twitch login` was run) so the
  // follower /channels/followers `total` is authorized; otherwise fall back to
  // the app token everywhere and just omit follower count.
  const userToken = await twitchUserToken().catch(() => null);
  const readHeaders = userToken ? { "client-id": clientId, authorization: `Bearer ${userToken}` } : appHeaders;

  const users = await getJson(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, readHeaders);
  const userId = users?.data?.[0]?.id as string | undefined;

  // /streams works with the app token; keep using it so live/viewers report
  // even when no user token is present.
  const streams = await getJson(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, appHeaders);
  const stream = streams?.data?.[0];

  const out: SocialChannel = {
    live: !!stream,
    viewers: stream?.viewer_count,
    url: `https://twitch.tv/${login}`,
  };
  // Follower total only returns with the user token; with the app token this
  // request 401s and getJson yields null, so we silently omit followers.
  if (userId && userToken) {
    const followers = await getJson(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`, readHeaders);
    if (typeof followers?.total === "number") out.followers = followers.total;
  }
  return out;
}

// ---- YouTube --------------------------------------------------------------

async function fetchYouTube(s: Secrets): Promise<SocialChannel | null> {
  const { apiKey, channelId } = s.youtube ?? {};
  if (!apiKey || !channelId) return null;
  const data = await getJson(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`,
  );
  const stats = data?.items?.[0]?.statistics;
  if (!stats) return null;
  return {
    live: false, // YouTube live detection costs heavy quota — rely on OBS for live
    followers: Number(stats.subscriberCount) || undefined,
    views: Number(stats.viewCount) || undefined,
    url: `https://youtube.com/channel/${channelId}`,
  };
}

// ---- growth ---------------------------------------------------------------

export type Growth = {
  followers: number;
  views?: number;
  deltaWeek: number;
  deltaMonth: number;
  series: { date: string; followers: number }[];
};

/**
 * Channel growth per platform from daily `social_snapshot` events: the latest
 * follower count plus its change over the last 7 / 30 days. Pure. Deltas are 0
 * until enough history accrues (one snapshot/day). Returns {} if no snapshots.
 */
export function socialGrowth(events: VibeEvent[], now = new Date()): Record<string, Growth> {
  const byPlatform: Record<string, Map<string, { followers: number; views?: number }>> = {};
  for (const e of events) {
    if (e.type !== "social_snapshot") continue;
    const platform = String((e as Record<string, unknown>).platform ?? "");
    const followers = Number((e as Record<string, unknown>).followers);
    if (!platform || !Number.isFinite(followers)) continue;
    const date = localDateString(new Date(e.ts));
    const views = Number((e as Record<string, unknown>).views);
    (byPlatform[platform] ??= new Map()).set(date, { followers, views: Number.isFinite(views) ? views : undefined });
  }

  const today = localDateString(now);
  const daysAgo = (n: number): string => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - n);
    return localDateString(d);
  };

  const out: Record<string, Growth> = {};
  for (const [platform, map] of Object.entries(byPlatform)) {
    const series = [...map.entries()]
      .map(([date, v]) => ({ date, followers: v.followers }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!series.length) continue;
    const cur = series[series.length - 1]!.followers;
    const at = (cutoff: string): number => {
      let v = series[0]!.followers;
      for (const s of series) {
        if (s.date <= cutoff) v = s.followers;
        else break;
      }
      return v;
    };
    out[platform] = {
      followers: cur,
      views: map.get(series[series.length - 1]!.date)?.views,
      deltaWeek: cur - at(daysAgo(7)),
      deltaMonth: cur - at(daysAgo(30)),
      series,
    };
  }
  return out;
}

/** Fetch all configured platforms. Returns null if none are configured. */
export async function fetchSocial(): Promise<SocialState | null> {
  const s = await readSecrets();
  const [twitch, youtube] = await Promise.all([fetchTwitch(s), fetchYouTube(s)]);
  if (!twitch && !youtube) return null;
  return {
    ...(twitch ? { twitch } : {}),
    ...(youtube ? { youtube } : {}),
    updatedAt: new Date().toISOString(),
  };
}
