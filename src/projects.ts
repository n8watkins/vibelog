import { getDailyUsageByCwd, labelProjects } from "./claude-projects.ts";
import { getCommitsByDay, getRemote, getRepoRoot } from "./git.ts";

/**
 * Real per-project activity for the dashboard, joined from two local sources:
 *  - Claude transcripts (~/.claude/projects) → tokens per cwd per day, and
 *  - git → the repo's normalized remote (identity) + commits per day.
 *
 * Projects are keyed on the normalized git remote (falling back to the repo
 * root path), so the same repo across clones/terminals collapses into one. No
 * network, no AI — see docs/INFRA_PLAN.md §2.
 */

export type ProjectInfo = {
  /** Unique, human display label (chip text + filter key). */
  name: string;
  /** Normalized remote, e.g. `github.com/owner/repo`, or null if local-only. */
  repo: string | null;
  tokens: number;
  /** Estimated USD (tokens × blended daily $/token rate — we have no per-project cost). */
  cost: number;
  commits: number;
  activeDays: number;
};

export type ProjectActivity = {
  projects: ProjectInfo[];
  /** name → date → { tokens, commits } — the project-scoped heatmap source. */
  byDay: Record<string, Record<string, { tokens: number; commits: number }>>;
};

type Group = { root: string; remote: string | null; tokensByDay: Record<string, number> };

/** Aggregate per-project activity since `since` (YYYY-MM-DD), costing tokens at `costPerToken`. */
export async function getProjectActivity(opts: {
  since: string;
  costPerToken: number;
  max?: number;
}): Promise<ProjectActivity> {
  const byCwd = await getDailyUsageByCwd();
  const cwds = Object.keys(byCwd);

  // Resolve each cwd to a stable project key (remote ?? repo root) and merge the
  // per-day token maps of cwds that resolve to the same repo.
  const groups = new Map<string, Group>();
  for (const cwd of cwds) {
    const root = (await getRepoRoot(cwd)) ?? cwd;
    const remote = await getRemote(cwd);
    const key = remote ?? root;
    let g = groups.get(key);
    if (!g) {
      g = { root, remote, tokensByDay: {} };
      groups.set(key, g);
    }
    for (const [date, tok] of Object.entries(byCwd[cwd]!)) {
      g.tokensByDay[date] = (g.tokensByDay[date] ?? 0) + tok;
    }
  }

  // Unique display labels from the repo roots (handles same-basename repos).
  const labels = labelProjects([...groups.values()].map((g) => g.root));

  const projects: ProjectInfo[] = [];
  const byDay: ProjectActivity["byDay"] = {};

  for (const g of groups.values()) {
    const name = labels.get(g.root) ?? g.root;
    const commitsByDay = await getCommitsByDay(g.root, opts.since);

    const dates = new Set([...Object.keys(g.tokensByDay), ...Object.keys(commitsByDay)]);
    const day: Record<string, { tokens: number; commits: number }> = {};
    let tokens = 0;
    let commits = 0;
    let activeDays = 0;
    for (const date of dates) {
      const t = g.tokensByDay[date] ?? 0;
      const c = commitsByDay[date] ?? 0;
      day[date] = { tokens: t, commits: c };
      tokens += t;
      commits += c;
      if (t > 0 || c > 0) activeDays += 1;
    }
    byDay[name] = day;
    projects.push({
      name,
      repo: g.remote,
      tokens,
      cost: +((tokens * opts.costPerToken).toFixed(2)),
      commits,
      activeDays,
    });
  }

  projects.sort((a, b) => b.tokens - a.tokens);
  return { projects: projects.slice(0, opts.max ?? 8), byDay };
}
