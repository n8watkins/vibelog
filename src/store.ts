import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { CONFIG_FILE, EVENTS_FILE, SESSION_FILE, STATE_FILE, VIBE_DIR } from "./config.ts";
import type { BuildLogEntry, BuildMode, LiveState } from "./state.ts";

/** Persistent session metadata — lets the server resume after a restart. */
export type Session = {
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

export const readState = () => readJson<LiveState>(STATE_FILE);
export const writeState = (s: LiveState) => writeJson(STATE_FILE, s);

/** Append-only private history. Raw and local — never served publicly. */
export async function appendEvent(event: Record<string, unknown>): Promise<void> {
  await ensureDir();
  await appendFile(EVENTS_FILE, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}
