/**
 * LiveState is the single contract between the agent (writer) and the overlay
 * (reader). It is public-safe by construction: only names/text the user typed
 * and numeric stats. No paths, diffs, prompts, or secrets ever land here.
 *
 * It is a trimmed subset of the PRD's PublicLiveState — see V0_SPEC.md §3.
 */

export type BuildMode =
  | "planning"
  | "designing"
  | "coding"
  | "debugging"
  | "polishing"
  | "deploying"
  | "shipping";

export const BUILD_MODES: BuildMode[] = [
  "planning",
  "designing",
  "coding",
  "debugging",
  "polishing",
  "deploying",
  "shipping",
];

export type LiveStats = {
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  commits: number;
  features: number;
  bugs: number;
  claudeTokens: number;
  /** Estimated USD cost of this session's Claude usage (from ccusage). */
  costUsd: number;
  /** Sub-agents spawned this session (Task tool invocations). */
  subAgents: number;
  /** Prompts submitted to Claude this session. */
  prompts: number;
  /** Current daily shipping streak (from the event log). */
  streak: number;
  /** Today's vibe score (from the event log). */
  vibeScore: number;
};

/** One entry in the build feed. `text` includes its emoji icon; `ts` is ISO. */
export type BuildLogEntry = {
  text: string;
  ts: string;
};

/** A project in the overlay ticker — ranked, [0] is the one in focus now. */
export type ProjectTick = { name: string; status: "active" | "idle"; note?: string };

/** Public-safe social stats for one channel (all numbers are already public). */
export type SocialChannel = {
  live: boolean;
  followers?: number;
  views?: number;
  viewers?: number;
  /** Highest concurrent viewer count seen this live session (high-water mark). */
  peakViewers?: number;
  url?: string;
};

/** Live status + audience counts across platforms, shown on the overlay/dashboard. */
export type SocialState = {
  twitch?: SocialChannel;
  youtube?: SocialChannel;
  updatedAt: string;
};

export type LiveState = {
  isLive: boolean;
  /** True while OBS reports an active stream output (from the obs-websocket bridge). */
  streaming: boolean;
  sessionTitle: string | null;
  project: { name: string; status: "active" | "paused" } | null;
  /** Ranked projects for the overlay ticker (most-recently-active first). */
  projects: ProjectTick[];
  nowBuilding: { title: string; mode: BuildMode } | null;
  /** Newest first, capped to BUILD_LOG_MAX entries. */
  buildLog: BuildLogEntry[];
  stats: LiveStats;
  /** Live status + follower/sub counts (Twitch/YouTube), or null if unconfigured. */
  social: SocialState | null;
  /**
   * A derived "personal best" flag, set when today beats an all-time record
   * (best single-day vibe score or longest shipping streak). PUBLIC-NUMERIC:
   * both fields are SHORT, fixed/derived strings — never raw user text — so they
   * are safe to paint onto the overlay/snapshot. Absent when no record is set.
   */
  record: { kind: string; label: string } | null;
  branch: string | null;
  startedAt: string | null;
  updatedAt: string;
};

/** Feed keeps more history now that /live renders it chat-style and scrolls. */
export const BUILD_LOG_MAX = 50;

export function emptyStats(): LiveStats {
  return {
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    commits: 0,
    features: 0,
    bugs: 0,
    claudeTokens: 0,
    costUsd: 0,
    subAgents: 0,
    prompts: 0,
    streak: 0,
    vibeScore: 0,
  };
}

export function emptyState(): LiveState {
  return {
    isLive: false,
    streaming: false,
    sessionTitle: null,
    project: null,
    projects: [],
    nowBuilding: null,
    buildLog: [],
    stats: emptyStats(),
    social: null,
    record: null,
    branch: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The stats a public surface may carry. Identical to LiveStats except the
 * dollar figure is optional: it is omitted entirely (not zeroed) unless the
 * owner opts in, so the number never leaves the machine by default.
 */
export type PublicLiveStats = Omit<LiveStats, "costUsd"> & { costUsd?: number };

/** LiveState as served on public surfaces (/state.json, /live, /embed, the Worker snapshot). */
export type PublicLiveState = Omit<LiveState, "stats"> & { stats: PublicLiveStats };

/**
 * Project the live state onto its public form. Decided 2026-11-01: dollar
 * spend is hidden publicly by default (`publicShowCost: false` in
 * settings.json); token counts stay visible. Pure: never mutates `state`.
 */
export function toPublicState(state: LiveState, opts: { showCost: boolean }): PublicLiveState {
  const { costUsd, ...rest } = state.stats;
  const stats: PublicLiveStats = opts.showCost ? { ...rest, costUsd } : rest;
  return { ...state, stats };
}
