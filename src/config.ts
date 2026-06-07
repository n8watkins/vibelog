import os from "node:os";
import path from "node:path";

/** Everything VibeLog persists lives here. Created lazily on first write. */
export const VIBE_DIR = path.join(os.homedir(), ".vibelog");
export const CONFIG_FILE = path.join(VIBE_DIR, "config.json");
export const SESSION_FILE = path.join(VIBE_DIR, "session.json");
export const STATE_FILE = path.join(VIBE_DIR, "state.json");
export const EVENTS_FILE = path.join(VIBE_DIR, "events.jsonl");

export const DEFAULT_PORT = 4545;
