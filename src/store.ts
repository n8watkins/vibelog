import { mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { CONFIG_FILE, EVENTS_FILE, SESSION_FILE, SETTINGS_FILE, STATE_FILE, VIBE_DIR } from "./config.ts";
import type { BuildLogEntry, BuildMode, LiveState } from "./state.ts";
import type { Settings } from "./theme.ts";

/** Persistent session metadata — lets the server resume after a restart. */
export type Session = {
  /** The agent process that owns this session. Missing in files written
   *  before 0.1.1; a recorded pid that is no longer running means the agent
   *  died without `vibe end`, so the session counts as over. */
  pid?: number;
  cwd: string;
  port: number;
  baseline: string | null;
  startedAt: string;
  title: string | null;
  project: { name: string; status: "active" | "paused" } | null;
  nowBuilding: { title: string; mode: BuildMode } | null;
  buildLog: BuildLogEntry[];
  features: number;
  bugs: number;
  /** Sub-agents (Task tool calls) spawned this session. */
  subAgents: number;
  /** Prompts submitted to Claude this session. */
  prompts: number;
  /** Today's Claude token total captured at session start; session tokens =
   *  current today total − this. Null until the first token poll sets it. */
  tokenBaseline: number | null;
  /** Today's Claude USD cost captured at session start; session cost =
   *  current today cost − this. Null until the first usage poll sets it. */
  costBaseline: number | null;
};

export type Config = {
  defaultProject: string | null;
  /** Optional channel links shown on /dashboard next to the live pill. */
  twitch?: string | null;
  youtube?: string | null;
  /** Extra hostnames (beyond localhost and IP literals) that may reach the
   *  agent's private routes, e.g. a local DNS name for this machine. */
  allowedHosts?: string[];
};

async function ensureDir(): Promise<void> {
  await mkdir(VIBE_DIR, { recursive: true });
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir();
  await writeFile(file, JSON.stringify(value, null, 2));
}

export const readConfig = () => readJson<Config>(CONFIG_FILE);
export const writeConfig = (c: Config) => writeJson(CONFIG_FILE, c);

export const readSession = () => readJson<Session>(SESSION_FILE);
export const writeSession = (s: Session) => writeJson(SESSION_FILE, s);

/** True when a process with this pid exists (EPERM: it exists, owned by someone else). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** True when the session's agent is known to be gone (a recorded pid that is not running). */
export function sessionIsStale(s: Session): boolean {
  return typeof s.pid === "number" && !pidAlive(s.pid);
}

/** The session of a running agent, or null when there is none or its agent is gone. */
export async function readLiveSession(): Promise<Session | null> {
  const s = await readSession();
  return s && !sessionIsStale(s) ? s : null;
}

/** Remove session.json (no error when it is already gone). */
export const clearSession = () => rm(SESSION_FILE, { force: true });

export const readState = () => readJson<LiveState>(STATE_FILE);
export const writeState = (s: LiveState) => writeJson(STATE_FILE, s);

/** Theme + (later) profile/integrations. Localhost writes only; the theme
 *  sub-tree is the only part ever served publicly — see src/theme.ts. */
export const readSettings = () => readJson<Settings>(SETTINGS_FILE);
export const writeSettings = (s: Settings) => writeJson(SETTINGS_FILE, s);

/** Append-only private history. Raw and local — never served publicly. */
export async function appendEvent(event: Record<string, unknown>): Promise<void> {
  await ensureDir();
  await appendFile(EVENTS_FILE, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}
