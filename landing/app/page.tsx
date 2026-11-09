import Image from "next/image";
import { CopyCommand } from "./copy-command";
import { Timecode } from "./timecode";
import { N8BUILDS_URL, RELEASE_URL, REPO_URL, SITE_URL, WAITLIST_URL } from "./site";

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

function GitHubMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function StarButton({ size = "md" }: { size?: "sm" | "md" }) {
  const pad = size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-[15px]";
  return (
    <a
      href={REPO_URL}
      className={`inline-flex items-center gap-2 rounded-md border border-line-2 bg-bg-3 font-semibold text-ink transition hover:border-accent/70 hover:bg-[#1d1d26] ${pad} ${focusRing}`}
    >
      <GitHubMark />
      <span>Star on GitHub</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 text-accent" fill="currentColor">
        <path d="M8 .75 10.2 5.3l5 .7-3.6 3.5.9 5L8 12.1 3.5 14.5l.9-5L.8 6l5-.7L8 .75Z" />
      </svg>
    </a>
  );
}

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="slate flex items-center gap-3 text-muted">
      <span className="text-accent">{index}</span>
      <span aria-hidden="true" className="h-px w-8 bg-line-2" />
      {children}
    </p>
  );
}

function Audience({ kind }: { kind: "stream" | "public" | "private" | "social" }) {
  const map = {
    stream: { text: "On stream", cls: "border-tally/50 text-[#ff8a8a]" },
    public: { text: "Public link", cls: "border-teal/40 text-teal" },
    private: { text: "Only you", cls: "border-line-2 text-muted" },
    social: { text: "Social card", cls: "border-accent/50 text-accent" },
  }[kind];
  return <span className={`slate inline-flex rounded-sm border px-2 py-1 ${map.cls}`}>{map.text}</span>;
}

/* ------------------------------------------------------------------ */
/* Hero monitor: an editor scene with the real HUD composited on top    */
/* ------------------------------------------------------------------ */

const CODE: { n: number; html: React.ReactNode }[] = [
  { n: 1, html: <><K>import</K> trails <K>from</K> <S>&quot;./trails.json&quot;</S>;</> },
  { n: 2, html: <><K>export type</K> <T>Trail</T> = {"{"} name: <T>string</T>; miles: <T>number</T>; gain: <T>number</T> {"}"};</> },
  { n: 3, html: <>&nbsp;</> },
  { n: 4, html: <><K>export function</K> <F>byDistance</F>(list: <T>Trail</T>[] = trails): <T>Trail</T>[] {"{"}</> },
  { n: 5, html: <>&nbsp;&nbsp;<K>return</K> [...list].<F>sort</F>((a, b) =&gt; a.miles - b.miles || a.name.<F>localeCompare</F>(b.name));</> },
  { n: 6, html: <>{"}"}</> },
  { n: 7, html: <>&nbsp;</> },
  { n: 8, html: <><K>export function</K> <F>difficulty</F>(t: <T>Trail</T>): <S>&quot;easy&quot;</S> | <S>&quot;moderate&quot;</S> | <S>&quot;hard&quot;</S> {"{"}</> },
  { n: 9, html: <>&nbsp;&nbsp;<K>const</K> perMile = t.gain / t.miles;</> },
  { n: 10, html: <>&nbsp;&nbsp;<K>return</K> perMile &gt; <N>300</N> ? <S>&quot;hard&quot;</S> : perMile &gt; <N>150</N> ? <S>&quot;moderate&quot;</S> : <S>&quot;easy&quot;</S>;</> },
  { n: 11, html: <>{"}"}</> },
];

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-[#c792ea]">{children}</span>;
}
function S({ children }: { children: React.ReactNode }) {
  return <span className="text-[#a5e075]">{children}</span>;
}
function T({ children }: { children: React.ReactNode }) {
  return <span className="text-[#7fd6e8]">{children}</span>;
}
function F({ children }: { children: React.ReactNode }) {
  return <span className="text-[#82aaff]">{children}</span>;
}
function N({ children }: { children: React.ReactNode }) {
  return <span className="text-[#f78c6c]">{children}</span>;
}

function ProgramMonitor() {
  return (
    <figure className="relative">
      <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-muted">
        <span className="slate flex items-center gap-2">
          <span className="rounded-sm bg-tally px-1.5 py-0.5 text-white">PGM</span>
          Scene: Coding
        </span>
        <span className="flex items-center gap-2">
          <span className="tally-dot size-2 rounded-full bg-tally" aria-hidden="true" />
          <span className="slate text-ink">Live</span>
          <Timecode />
        </span>
      </div>
      <div className="monitor scanlines relative aspect-video overflow-hidden sm:aspect-[16/8] lg:aspect-[16/6] rounded-sm border border-line-2 bg-[#0e0f14]">
        {/* Editor chrome (decorative stand-in for the streamer's screen). */}
        <div aria-hidden="true" className="absolute inset-0 flex flex-col">
          <div className="flex h-[7%] items-end gap-px border-b border-[#20212b] bg-[#0b0c10] px-[2%] text-[clamp(6px,1vw,12px)]">
            <span className="rounded-t-sm border-t-2 border-accent bg-[#0e0f14] px-[1.4%] py-[0.5%] font-mono text-ink">list.ts</span>
            <span className="px-[1.4%] py-[0.5%] font-mono text-dim">map.ts</span>
            <span className="px-[1.4%] py-[0.5%] font-mono text-dim">trails.json</span>
          </div>
          <div className="flex-1 overflow-hidden px-[2%] pt-[1.6%] font-mono text-[clamp(5px,0.95vw,12px)] leading-[1.5] text-[#c9cbd6]">
            {CODE.map((l) => (
              <div key={l.n} className="flex whitespace-pre">
                <span className="w-[3.2em] shrink-0 pr-[1em] text-right text-[#4b4d5c]">{l.n}</span>
                <span>{l.html}</span>
              </div>
            ))}
          </div>
        </div>
        {/* The real OBS HUD, captured from a local `vibe start` session. */}
        <Image
          src="/shots/hud-strip.webp"
          alt="The VibeLog HUD along the bottom of the stream: projects, now building with the build feed, and live stats such as 2 features, 3 commits, 4 prompts, 2 sub-agents and 443.9k tokens."
          width={2400}
          height={362}
          priority
          sizes="(min-width: 1280px) 1180px, 100vw"
          className="absolute right-0 bottom-0 left-0 h-auto w-full"
        />
      </div>
      <figcaption className="mt-3 text-sm text-dim">
        The HUD is a real capture from a <code className="font-mono text-muted">vibe start</code> session on a test repo; the editor behind it is a
        stand-in for your screen.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const SCENES = [
  {
    id: "hud",
    n: "01",
    name: "OBS HUD",
    route: "localhost:4545/overlay",
    audience: "stream" as const,
    body: "A transparent Browser Source that sits along the bottom of your scene: what you are building, the build feed, and live stats from git and Claude Code. It updates every few seconds while you work.",
    img: { src: "/shots/hud-detail.webp", w: 1785, h: 435, alt: "Close-up of the HUD: the Now Building panel with the build feed, and live stats: 2 features, 3 commits, 4 prompts, 2 sub-agents, 443.9k tokens." },
  },
  {
    id: "live",
    n: "02",
    name: "/live page",
    route: "/live",
    audience: "public" as const,
    body: "A page anyone can open while you stream: your headline, what you are on right now, today's numbers and the build feed. Share it with vibe share (a Cloudflare tunnel, read-only) or publish snapshots to a Worker you own.",
    img: { src: "/shots/live.webp", w: 1600, h: 1075, alt: "The public /live page: a large Now Building headline, Map preview cards for each trail, above stat tiles and the build feed." },
  },
  {
    id: "dashboard",
    n: "03",
    name: "Dashboard",
    route: "localhost:4545/dashboard",
    audience: "private" as const,
    body: "Your own history: Claude tokens per day for the past year, sessions, streaks, stream time and channel growth, per project. It only answers on localhost. Shown here with the built-in demo data (vibe demo).",
    img: { src: "/shots/dashboard-demo.webp", w: 1800, h: 1373, alt: "The private dashboard with a year-long activity heatmap, session stats, the week and channel growth, using demo data." },
  },
  {
    id: "share",
    n: "04",
    name: "Share card",
    route: "/share/card.png",
    audience: "social" as const,
    body: "A 1200 by 630 card for the post after the stream, rendered on your machine from the public numbers only. Links to your /share page unfurl with it.",
    img: { src: "/shots/share-card.webp", w: 1200, h: 630, alt: "A share card: N8, Building trail-mix live with Claude Code, 2 features, 2m time live, 444k tokens, 3 commits." },
  },
];

const STEPS = [
  {
    n: "1",
    title: "Install",
    body: "You need Node and git. There is no package to install yet, so it runs from the repo.",
    label: "terminal",
    lines: [`git clone ${REPO_URL}`, "cd vibelog && npm install"],
  },
  {
    n: "2",
    title: "Start a session",
    body: "Point it at the repo you are streaming. Then add a Browser Source in OBS for http://localhost:4545/overlay at 1920 by 1080.",
    label: "terminal",
    lines: ['npm run vibe -- start --cwd ~/code/my-app --title "Building my app"'],
  },
  {
    n: "3",
    title: "Hook up Claude Code",
    body: "Each prompt updates Now Building, sub-agents get counted, and you mark wins as you go. vibe end stops it and vibe report gives you the recap.",
    label: "terminal",
    lines: ["npm run vibe -- hooks install --global", 'npm run vibe -- mark feature "trail list renders"'],
  },
];

const ROADMAP: { title: string; note: string; tone: string; items: string[] }[] = [
  {
    title: "Works today",
    note: "Checked end to end in a real session",
    tone: "text-teal",
    items: [
      "Git stats: lines, files, commits, branch",
      "Claude Code hooks: prompts, sub-agents, Now Building",
      "OBS HUD, /live, dashboard, share cards",
      "Secret scrubbing before anything reaches a page",
      "Token and cost counts from local transcripts",
      "Daily and weekly recaps (vibe report)",
    ],
  },
  {
    title: "Built, not yet verified",
    note: "Code is there; not tested with real accounts",
    tone: "text-[#ffc46b]",
    items: [
      "OBS stream time over the OBS WebSocket",
      "Twitch and YouTube live status and followers",
      "Discord and GitHub connect",
      "AI summaries with a Gemini key",
      "Publishing /live to your own Cloudflare Worker",
    ],
  },
  {
    title: "Planned",
    note: "Not built yet",
    tone: "text-muted",
    items: [
      "A one-line install (npm package)",
      "macOS and Linux setup guides",
      "Codex and Gemini CLI, not just Claude Code",
      "A hosted /live page, no Worker of your own",
    ],
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "VibeLog",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Windows (WSL)",
  description:
    "Live coding telemetry for vibe-coding streams: an OBS HUD, a public /live page, a private dashboard and share cards, from your git repo and Claude Code session.",
  license: "https://opensource.org/licenses/MIT",
  softwareVersion: "0.1.0",
  datePublished: "2026-11-02",
  codeRepository: REPO_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", name: "N8", url: N8BUILDS_URL },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <nav aria-label="Primary" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className={`flex items-center gap-2 rounded-sm ${focusRing}`}>
            <span aria-hidden="true" className="grid size-6 place-items-center rounded-sm bg-tally">
              <span className="size-2 rounded-full bg-white" />
            </span>
            <span className="display text-xl normal-case tracking-tight">VibeLog</span>
          </a>
          <ul className="hidden items-center gap-7 text-sm text-muted md:flex">
            <li><a className="transition hover:text-ink" href="#product">Product</a></li>
            <li><a className="transition hover:text-ink" href="#how">How it works</a></li>
            <li><a className="transition hover:text-ink" href="#privacy">Privacy</a></li>
            <li><a className="transition hover:text-ink" href="#roadmap">Roadmap</a></li>
          </ul>
          <StarButton size="sm" />
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section id="top" aria-labelledby="hero-title" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 pt-10 pb-14 sm:px-6 sm:pt-12">
            <p className="slate flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              <span>Live coding telemetry</span>
              <span aria-hidden="true" className="text-line-2">/</span>
              <span>Open source</span>
              <span aria-hidden="true" className="hidden text-line-2 sm:inline">/</span>
              <span className="hidden sm:inline">v0.1.0</span>
            </p>
            <h1 id="hero-title" className="display mt-4 text-[clamp(2.9rem,8.6vw,4.75rem)]">
              Stream the build,{" "}
              <br className="hidden sm:block" />
              <span className="text-accent">not just the screen.</span>
            </h1>
            <div className="mt-5 grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-end lg:gap-12">
              <div>
                <p className="max-w-[46rem] text-[17px] leading-relaxed text-pretty text-muted">
                  VibeLog reads your git repo and your Claude Code session and puts the real numbers on stream: what you are building,
                  commits, lines, prompts, sub-agents and tokens. It runs on your machine, and nothing leaves it unless you share it.
                </p>
                <p className="mt-3 text-[15px] text-ink">For streamers and builders who code with AI agents, live.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <StarButton />
                <a
                  href="#how"
                  className={`inline-flex min-h-11 items-center rounded-md px-4 text-[15px] font-semibold text-muted underline-offset-4 transition hover:text-ink hover:underline ${focusRing}`}
                >
                  How it works
                </a>
              </div>
            </div>
            <div className="mt-8">
              <ProgramMonitor />
            </div>
          </div>
        </section>

        {/* Product: four outputs */}
        <section id="product" aria-labelledby="product-title" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <SectionLabel index="01">The product</SectionLabel>
            <h2 id="product-title" className="display mt-4 max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)]">
              One local process, four outputs.
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
              Every screen below is VibeLog itself, captured from a test session. Each one is for a different audience, so each one shows
              different things.
            </p>

            <ol className="mt-12 divide-y divide-line border-y border-line">
              {SCENES.map((s) => (
                <li key={s.id} id={`scene-${s.id}`} className="grid gap-6 py-10 lg:grid-cols-[300px_1fr] lg:gap-12 [&>*]:min-w-0">
                  <div>
                    <p className="slate text-dim">Scene {s.n}</p>
                    <h3 className="display mt-2 text-4xl normal-case">{s.name}</h3>
                    <p className="mt-2 font-mono text-[13px] text-accent">{s.route}</p>
                    <div className="mt-4">
                      <Audience kind={s.audience} />
                    </div>
                    <p className="mt-4 leading-relaxed text-muted">{s.body}</p>
                  </div>
                  <figure className={s.id === "hud" ? "self-center rounded-sm border border-line bg-[linear-gradient(135deg,#1a1b22,#0e0f14)] p-3 sm:p-6" : ""}>
                    {s.id === "live" ? (
                      <div className="grid grid-cols-[1fr_auto] items-start gap-4">
                        <Image src={s.img.src} alt={s.img.alt} width={s.img.w} height={s.img.h} sizes="(min-width: 1024px) 640px, 70vw" className="h-auto w-full rounded-sm border border-line" />
                        <Image
                          src="/shots/live-phone.webp"
                          alt="The same /live page on a phone."
                          width={780}
                          height={1400}
                          sizes="(min-width: 1024px) 160px, 25vw"
                          className="h-auto w-[clamp(84px,22vw,170px)] rounded-[14px] border-4 border-[#1e1f27]"
                        />
                      </div>
                    ) : (
                      <Image
                        src={s.img.src}
                        alt={s.img.alt}
                        width={s.img.w}
                        height={s.img.h}
                        sizes="(min-width: 1024px) 820px, 100vw"
                        className={`h-auto w-full ${s.id === "hud" ? "" : "rounded-sm border border-line"}`}
                      />
                    )}
                  </figure>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="border-b border-line bg-bg-2">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <SectionLabel index="02">How it works</SectionLabel>
            <h2 id="how-title" className="display mt-4 text-[clamp(2.25rem,5vw,3.75rem)]">
              Three steps to your first stream.
            </h2>
            <ol className="mt-10 divide-y divide-line border-y border-line">
              {STEPS.map((s) => (
                <li key={s.n} className="grid gap-5 py-8 lg:grid-cols-[1fr_1.35fr] lg:gap-12 [&>*]:min-w-0">
                  <div className="flex gap-5">
                    <span className="display w-10 shrink-0 text-6xl text-accent">{s.n}</span>
                    <div>
                      <h3 className="text-xl font-bold">{s.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
                    </div>
                  </div>
                  <CopyCommand lines={s.lines} label={`Step ${s.n} commands`} />
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-dim">
              Want to look around first? <code className="font-mono text-muted">npm run vibe -- demo</code> serves every screen with seeded data
              and writes nothing to your real history.
            </p>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" aria-labelledby="privacy-title" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <SectionLabel index="03">Privacy</SectionLabel>
            <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <h2 id="privacy-title" className="display text-[clamp(2.25rem,5vw,3.75rem)]">
                  Your machine is the server.
                </h2>
                <p className="mt-4 leading-relaxed text-muted">
                  VibeLog is one Node process on localhost. No account, no cloud by default. Token counts come from the Claude Code transcripts
                  already on your disk, with no network call and no extra package.
                </p>
                <ul className="mt-6 space-y-3 text-[15px] leading-relaxed">
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 bg-accent" />
                    <span>
                      Text headed for a page goes through a secret scrubber (API keys, tokens, private keys) and a 140 character cap. Prompts,
                      file paths and diffs never reach a public page.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 bg-accent" />
                    <span>
                      Dollar spend never shows on a public surface: /live, the embed, share cards and published snapshots leave it out unless you
                      turn it on. Your OBS HUD can show it, because it reads your own machine, so keep it out of your scene if you like.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 bg-accent" />
                    <span>
                      Viewers who come in through a tunnel or your network get read-only pages. Other websites open in your browser cannot write to
                      your HUD or read your dashboard.
                    </span>
                  </li>
                </ul>
              </div>
              <div className="self-start overflow-hidden rounded-sm border border-line">
                <table className="w-full text-left text-[15px]">
                  <caption className="sr-only">What stays on your machine and what viewers can see</caption>
                  <thead className="bg-bg-2">
                    <tr>
                      <th scope="col" className="slate px-4 py-3 font-semibold text-muted">Data</th>
                      <th scope="col" className="slate px-4 py-3 font-semibold text-muted">Stays local</th>
                      <th scope="col" className="slate px-4 py-3 font-semibold text-muted">Viewers see</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[
                      ["Your prompts", "Yes", "A short label, scrubbed"],
                      ["Code, diffs, file paths", "Yes", "Never"],
                      ["API keys and tokens", "Yes", "Never"],
                      ["Commits, lines, files", "Yes", "Counts only"],
                      ["Claude tokens", "Yes", "A total"],
                      ["Dollar spend", "Yes", "Only if you opt in"],
                      ["History and per-project data", "Yes", "Never"],
                    ].map(([d, l, v]) => (
                      <tr key={d}>
                        <th scope="row" className="px-4 py-3 font-medium">{d}</th>
                        <td className="px-4 py-3 text-teal">{l}</td>
                        <td className="px-4 py-3 text-muted">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Open source */}
        <section id="open-source" aria-labelledby="oss-title" className="border-b border-line bg-bg-2">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <SectionLabel index="04">Open source</SectionLabel>
              <h2 id="oss-title" className="display mt-4 text-[clamp(2.25rem,5vw,3.75rem)]">
                MIT licensed. Read every line.
              </h2>
              <p className="mt-4 max-w-xl leading-relaxed text-muted">
                A tool that watches your repo and your prompts should be one you can audit. The source has been public since November 1, 2026,
                and v0.1.0 shipped on November 2. Issues and pull requests are open.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <StarButton />
                <a href={RELEASE_URL} className={`inline-flex min-h-11 items-center rounded-md px-4 text-[15px] font-semibold text-muted underline-offset-4 hover:text-ink hover:underline ${focusRing}`}>
                  Release notes for v0.1.0
                </a>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line">
              {[
                ["License", "MIT"],
                ["Version", "0.1.0"],
                ["Open since", "Nov 1, 2026"],
                ["Tested on", "Windows (WSL)"],
              ].map(([k, v]) => (
                <div key={k} className="bg-bg p-5">
                  <dt className="slate text-dim">{k}</dt>
                  <dd className="display mt-2 text-2xl normal-case sm:text-3xl">{v}</dd>
                </div>
              ))}
              <div className="col-span-2 bg-bg p-5 text-sm leading-relaxed text-muted">
                I build and test on Windows with WSL. macOS and Linux should work, since it is Node and git, but nobody has tested them yet.
                Only Claude Code is tracked for now.
              </div>
            </dl>
          </div>
        </section>

        {/* Roadmap */}
        <section id="roadmap" aria-labelledby="roadmap-title" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <SectionLabel index="05">Roadmap</SectionLabel>
            <h2 id="roadmap-title" className="display mt-4 text-[clamp(2.25rem,5vw,3.75rem)]">
              What works, what doesn&apos;t yet.
            </h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
              {ROADMAP.map((col) => (
                <div key={col.title} className="bg-bg p-6">
                  <h3 className={`slate ${col.tone}`}>{col.title}</h3>
                  <p className="mt-1 text-sm text-dim">{col.note}</p>
                  <ul className="mt-5 space-y-3 text-[15px]">
                    {col.items.map((i) => (
                      <li key={i} className="flex gap-3">
                        <span aria-hidden="true" className={`mt-[0.55em] h-px w-3 shrink-0 bg-current ${col.tone}`} />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-dim">
              Want the hosted version when it exists?{" "}
              <a href={WAITLIST_URL} className="text-muted underline underline-offset-4 hover:text-ink">
                Get a note on n8builds.dev
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          VibeLog is built by N8 at{" "}
          <a href={N8BUILDS_URL} className="text-muted underline-offset-4 hover:text-ink hover:underline">
            n8builds.dev
          </a>
          . MIT licensed.
        </p>
        <a href={REPO_URL} className="inline-flex items-center gap-2 text-muted hover:text-ink">
          <GitHubMark />
          n8watkins/vibelog
        </a>
      </footer>
    </>
  );
}
