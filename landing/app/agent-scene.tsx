"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Timecode } from "./timecode";

/*
 * The hero scene: agent sessions working in terminal panes, with the VibeLog
 * HUD updating alongside. It replays the test session the screenshots on this
 * page come from (the trail-mix repo): prompts, tool calls, a sub-agent, diffs,
 * commits and `vibe mark`. Plain text and CSS, no video. With reduced motion it
 * shows the finished state and does not animate.
 */

type Cls = "prompt" | "ai" | "tool" | "out" | "add" | "del" | "ok" | "cmd" | "head";
type PaneId = "main" | "sub" | "sh";
type Line = { id: number; text: string; cls: Cls; shown: number };

type Hud = {
  building: string;
  feed: string[];
  features: number;
  commits: number;
  prompts: number;
  subAgents: number;
  tokens: number;
  lines: number;
};

type State = { panes: Record<PaneId, Line[]>; hud: Hud; active: PaneId | null };

type Step = {
  pane: PaneId;
  text: string;
  cls: Cls;
  /** Pause before this step starts, in ms. */
  wait?: number;
  /** Reveal the line character by character. */
  stream?: boolean;
  hud?: (h: Hud) => Partial<Hud>;
};

const START_HUD: Hud = {
  building: "Trail list from a JSON file",
  feed: ["✨ trail list renders from json"],
  features: 1,
  commits: 1,
  prompts: 1,
  subAgents: 0,
  tokens: 58_000,
  lines: 9,
};

const SCRIPT: Step[] = [
  { pane: "main", cls: "prompt", text: "> add a difficulty badge based on elevation gain per mile", stream: true, wait: 600,
    hud: (h) => ({ prompts: h.prompts + 1, building: "Difficulty badge from gain per mile" }) },
  { pane: "main", cls: "ai", text: "I'll add a difficulty() helper next to byDistance and show it on each card.", stream: true, wait: 500 },
  { pane: "main", cls: "tool", text: "● Read(src/list.ts)", wait: 500 },
  { pane: "main", cls: "out", text: "  ⎿  Read 12 lines", wait: 300 },
  { pane: "main", cls: "tool", text: "● Update(src/list.ts)", wait: 600 },
  { pane: "main", cls: "add", text: "+ export function difficulty(t: Trail) {", wait: 180 },
  { pane: "main", cls: "add", text: "+   const perMile = t.gain / t.miles;", wait: 140 },
  { pane: "main", cls: "add", text: '+   return perMile > 300 ? "hard" : perMile > 150 ? "moderate" : "easy";', wait: 140 },
  { pane: "main", cls: "add", text: "+ }", wait: 140, hud: (h) => ({ lines: h.lines + 4 }) },
  { pane: "main", cls: "tool", text: "● Task(Write tests for difficulty)", wait: 600, hud: (h) => ({ subAgents: h.subAgents + 1 }) },
  { pane: "sub", cls: "head", text: "sub-agent · write tests for difficulty", wait: 300 },
  { pane: "sub", cls: "tool", text: "● Write(test/difficulty.test.ts)", wait: 500 },
  { pane: "sub", cls: "add", text: '+ test("steep trails are hard", () => {', wait: 160 },
  { pane: "sub", cls: "add", text: '+   expect(difficulty(mistTrail)).toBe("hard");', wait: 140 },
  { pane: "sub", cls: "add", text: "+ });", wait: 140, hud: (h) => ({ lines: h.lines + 9 }) },
  { pane: "sub", cls: "ok", text: "  ⎿  Wrote 9 lines. Done.", wait: 400 },
  { pane: "main", cls: "tool", text: "● Bash(npm test)", wait: 500 },
  { pane: "main", cls: "ok", text: "  ⎿  ✓ 6 passed (412ms)", wait: 700 },
  { pane: "main", cls: "ai", text: "Done: every trail card shows a difficulty badge, with tests.", stream: true, wait: 300 },
  { pane: "sh", cls: "cmd", text: '$ git commit -am "feat: difficulty badge"', stream: true, wait: 600 },
  { pane: "sh", cls: "out", text: "[main 3f2c1a9] 2 files changed, 13 insertions(+)", wait: 250, hud: (h) => ({ commits: h.commits + 1 }) },
  { pane: "sh", cls: "cmd", text: '$ vibe mark feature "difficulty badge"', stream: true, wait: 500 },
  { pane: "sh", cls: "ok", text: "Marked feature: difficulty badge", wait: 250,
    hud: (h) => ({ features: h.features + 1, feed: ["✨ difficulty badge", ...h.feed].slice(0, 3) }) },
  { pane: "main", cls: "prompt", text: "> sorting breaks when two trails have the same miles, fix it", stream: true, wait: 1200,
    hud: (h) => ({ prompts: h.prompts + 1, building: "Stable sort for equal miles" }) },
  { pane: "main", cls: "ai", text: "The comparator only looks at miles. I'll fall back to the name.", stream: true, wait: 500 },
  { pane: "main", cls: "tool", text: "● Update(src/list.ts)", wait: 500 },
  { pane: "main", cls: "del", text: "-   return [...list].sort((a, b) => a.miles - b.miles);", wait: 200 },
  { pane: "main", cls: "add", text: "+   return [...list].sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));", wait: 200,
    hud: (h) => ({ lines: h.lines + 1 }) },
  { pane: "main", cls: "tool", text: "● Bash(npm test)", wait: 500 },
  { pane: "main", cls: "ok", text: "  ⎿  ✓ 7 passed (398ms)", wait: 700 },
  { pane: "sh", cls: "cmd", text: '$ git commit -am "fix: stable sort on equal miles"', stream: true, wait: 600 },
  { pane: "sh", cls: "out", text: "[main 8d41e07] 1 file changed, 1 insertion(+), 1 deletion(-)", wait: 250, hud: (h) => ({ commits: h.commits + 1 }) },
  { pane: "sh", cls: "cmd", text: '$ vibe mark bug "sort ties now stable"', stream: true, wait: 500 },
  { pane: "sh", cls: "ok", text: "Marked bug: sort ties now stable", wait: 250,
    hud: (h) => ({ feed: ["🐛 sort ties now stable", ...h.feed].slice(0, 3) }) },
];

const EMPTY: State = { panes: { main: [], sub: [], sh: [] }, hud: START_HUD, active: null };

type Action =
  | { t: "reset" }
  | { t: "line"; step: Step; id: number }
  | { t: "reveal"; pane: PaneId; id: number; n: number }
  | { t: "tokens"; n: number };

const MAX_LINES = 14;

function apply(state: State, step: Step, id: number, full: boolean): State {
  const line: Line = { id, text: step.text, cls: step.cls, shown: full || !step.stream ? step.text.length : 0 };
  const panes = { ...state.panes, [step.pane]: [...state.panes[step.pane], line].slice(-MAX_LINES) };
  const hud = step.hud ? { ...state.hud, ...step.hud(state.hud) } : state.hud;
  return { panes, hud, active: step.pane };
}

function reducer(state: State, a: Action): State {
  switch (a.t) {
    case "reset":
      return EMPTY;
    case "line":
      return apply(state, a.step, a.id, false);
    case "reveal":
      return {
        ...state,
        panes: {
          ...state.panes,
          [a.pane]: state.panes[a.pane].map((l) => (l.id === a.id ? { ...l, shown: a.n } : l)),
        },
      };
    case "tokens":
      return { ...state, hud: { ...state.hud, tokens: state.hud.tokens + a.n } };
  }
}

/** The finished scene, shown as-is when the viewer prefers reduced motion. */
const FINAL: State = (() => {
  let s = EMPTY;
  SCRIPT.forEach((step, i) => (s = apply(s, step, i, true)));
  return { ...s, hud: { ...s.hud, tokens: 443_900 }, active: "main" };
})();

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(1)}k`);

const CLS: Record<Cls, string> = {
  prompt: "text-[#f3f0ff] font-semibold",
  ai: "text-[#d6d3e3]",
  tool: "text-[#b18cff]",
  out: "text-[#8b8999]",
  add: "text-[#7ee2a8] bg-[#7ee2a8]/[0.07]",
  del: "text-[#ff8a8a] bg-[#ff8a8a]/[0.08]",
  ok: "text-[#3ee0b4]",
  cmd: "text-[#eeedf3]",
  head: "text-[#ffc46b]",
};

function Pane({ title, lines, active, className = "" }: { title: string; lines: Line[]; active: boolean; className?: string }) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[3px] border ${active ? "border-[#b18cff]/50" : "border-[#26262f]"} bg-[#0c0c10] ${className}`}>
      <div className="flex items-center justify-between border-b border-[#1d1d25] px-2.5 py-1 font-mono text-[10px] text-[#8b8999]">
        <span className="truncate">{title}</span>
        {active ? <span className="size-1.5 shrink-0 rounded-full bg-[#3ee0b4]" /> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-2.5 py-1.5 font-mono text-[clamp(9px,0.92vw,12px)] leading-[1.55]">
        {lines.map((l, i) => (
          <div key={l.id} className={`truncate whitespace-pre ${CLS[l.cls]}`}>
            {l.text.slice(0, l.shown)}
            {active && i === lines.length - 1 ? <span className="pane-cursor ml-px inline-block h-[1.05em] w-[0.55em] translate-y-[0.15em] bg-[#eeedf3]/80" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="min-w-0">
      <div className={`font-mono text-[clamp(12px,1.35vw,18px)] font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="truncate font-mono text-[clamp(7px,0.62vw,9px)] tracking-[0.12em] text-[#a99fce] uppercase">{label}</div>
    </div>
  );
}

/** A faithful copy of the overlay's bottom strip: now building + feed, live stats. */
function Hud({ hud }: { hud: Hud }) {
  const panel = "rounded-[10px] border border-[#a786ff]/30 bg-[linear-gradient(165deg,rgba(38,22,72,0.82),rgba(14,11,28,0.9))] shadow-[0_0_22px_rgba(160,107,255,0.18)]";
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.7fr_1fr]">
      <div className={`${panel} min-w-0 px-3 py-2`}>
        <div className="font-mono text-[clamp(7px,0.62vw,9px)] font-bold tracking-[0.16em] text-[#a06bff] uppercase">Now building</div>
        <div className="mt-0.5 truncate text-[clamp(13px,1.35vw,18px)] font-bold text-[#f3f0ff]">{hud.building}</div>
        <ul className="mt-1 space-y-0.5 text-[clamp(9px,0.85vw,12px)] text-[#c9c3e6]">
          {hud.feed.map((f) => (
            <li key={f} className="hud-feed truncate">
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${panel} grid grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2`}>
        <Stat value={String(hud.features)} label="features" tone="text-[#f3f0ff]" />
        <Stat value={String(hud.commits)} label="commits" tone="text-[#f3f0ff]" />
        <Stat value={String(hud.prompts)} label="prompts" tone="text-[#f3f0ff]" />
        <Stat value={String(hud.subAgents)} label="sub-agents" tone="text-[#f3f0ff]" />
        <Stat value={fmtTokens(hud.tokens)} label="tokens" tone="text-[#c9aaff]" />
        <Stat value={`+${hud.lines}`} label="lines" tone="text-[#22d3a6]" />
      </div>
    </div>
  );
}

export function AgentScene() {
  const [live, dispatch] = useReducer(reducer, EMPTY);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
  const state = reduced ? FINAL : live;

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((r) => {
        const tick = () => {
          if (cancelled) return;
          if (pausedRef.current) timers.push(setTimeout(tick, 200));
          else timers.push(setTimeout(r, ms));
        };
        tick();
      });

    // Tokens climb while the agents work, like the real HUD between polls.
    const tok = setInterval(() => {
      if (!pausedRef.current) dispatch({ t: "tokens", n: 900 + Math.floor(Math.random() * 2600) });
    }, 450);

    (async () => {
      let id = 0;
      while (!cancelled) {
        dispatch({ t: "reset" });
        for (const step of SCRIPT) {
          if (cancelled) return;
          await sleep(step.wait ?? 300);
          const myId = id++;
          dispatch({ t: "line", step, id: myId });
          if (step.stream) {
            for (let n = 0; n <= step.text.length; n += 2) {
              await sleep(22);
              dispatch({ t: "reveal", pane: step.pane, id: myId, n });
            }
            dispatch({ t: "reveal", pane: step.pane, id: myId, n: step.text.length });
          }
        }
        await sleep(4000);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearInterval(tok);
    };
  }, [reduced]);

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] text-muted">
        <span className="slate flex items-center gap-2">
          <span className="rounded-sm bg-tally px-1.5 py-0.5 text-white">PGM</span>
          <span className="hidden sm:inline">Scene: agents at work</span>
        </span>
        <span className="flex items-center gap-3">
          {!reduced ? (
            <PauseButton
              paused={paused}
              onToggle={() => {
                pausedRef.current = !paused;
                setPaused(!paused);
              }}
            />
          ) : null}
          <span className="flex items-center gap-2">
            <span className="tally-dot size-2 rounded-full bg-tally" aria-hidden="true" />
            <span className="slate text-ink">Live</span>
            <Timecode />
          </span>
        </span>
      </div>
      <p className="sr-only">
        Animation: an AI agent in a terminal adds a feature and fixes a bug, a sub-agent writes tests, commits land in a shell, and the VibeLog
        overlay below updates its counts for prompts, commits, sub-agents and tokens.
      </p>
      <div aria-hidden="true" className="monitor relative h-[500px] overflow-hidden rounded-sm border border-line-2 bg-[#08080b] sm:h-auto sm:aspect-[16/6.8]">
        <div className="flex h-full flex-col gap-2 p-2.5 sm:p-4">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[1.55fr_1fr]">
            <Pane title="1 · claude · ~/trail-mix" lines={state.panes.main} active={state.active === "main"} />
            <div className="hidden min-h-0 grid-rows-2 gap-2 sm:grid">
              <Pane title="2 · sub-agent · tests" lines={state.panes.sub} active={state.active === "sub"} />
              <Pane title="3 · zsh · ~/trail-mix" lines={state.panes.sh} active={state.active === "sh"} />
            </div>
          </div>
          <Hud hud={state.hud} />
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-dim">
        A replay of a real test session, animated. The overlay strip copies VibeLog&apos;s own; a real capture is further down.
      </figcaption>
    </figure>
  );
}

function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? "Play the animation" : "Pause the animation"}
      className="grid size-7 place-items-center rounded-full border border-[#34343f] bg-[#0b0b0e]/80 text-[#a3a1b2] transition hover:text-[#eeedf3] focus-visible:outline-2 focus-visible:outline-[#b18cff]"
    >
      {paused ? (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5v11l9-5.5-9-5.5Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
        </svg>
      )}
    </button>
  );
}
