import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Local-only secrets, read from ~/.vibelog/secrets.json (chmod 600). This file
 * holds every credential VibeLog touches — Gemini key, OBS websocket password,
 * Twitch/YouTube app creds. It lives outside the repo, is gitignored, is read by
 * this process and NEVER exported into the streamed shell, logged, or sent to
 * LiveState/the overlay (see docs/INFRA_PLAN.md §1/§4).
 */
export const SECRETS_FILE = path.join(os.homedir(), ".vibelog", "secrets.json");

export type Secrets = {
  geminiApiKey?: string;
  geminiModel?: string;
  obs?: { url?: string; password?: string; enabled?: boolean };
  twitch?: { clientId?: string; clientSecret?: string; login?: string };
  // `apiKey`/`channelId` drive the public-stats poller (social.ts); the OAuth
  // `clientId`/`clientSecret` drive the dashboard "Connect" flow (oauth.ts).
  youtube?: { apiKey?: string; channelId?: string; clientId?: string; clientSecret?: string };
  discord?: { clientId?: string; clientSecret?: string };
  github?: { clientId?: string; clientSecret?: string; login?: string };
};

let cache: { at: number; data: Secrets } | null = null;

/** Read (and briefly cache) the secrets file. Returns {} if absent/unreadable. */
export async function readSecrets(maxAgeMs = 30_000): Promise<Secrets> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.data;
  let data: Secrets = {};
  try {
    data = JSON.parse(await readFile(SECRETS_FILE, "utf8")) as Secrets;
  } catch {
    // no secrets file — zero-config mode
  }
  cache = { at: Date.now(), data };
  return data;
}
