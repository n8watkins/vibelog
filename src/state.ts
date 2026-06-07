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
};

export type LiveState = {
  isLive: boolean;
  sessionTitle: string | null;
  project: { name: string; status: "active" | "paused" } | null;
  nowBuilding: { title: string; mode: BuildMode } | null;
  /** Newest first, capped to BUILD_LOG_MAX entries. */
  buildLog: string[];
  stats: LiveStats;
  branch: string | null;
  startedAt: string | null;
  updatedAt: string;
};

export const BUILD_LOG_MAX = 6;

export function emptyStats(): LiveStats {
  return {
    linesAdded: 0,
    linesRemoved: 0,
    filesChanged: 0,
    commits: 0,
    features: 0,
    bugs: 0,
    claudeTokens: 0,
  };
}

export function emptyState(): LiveState {
  return {
    isLive: false,
    sessionTitle: null,
    project: null,
    nowBuilding: null,
    buildLog: [],
    stats: emptyStats(),
    branch: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  };
}
