import Image from "next/image";
import { AgentScene } from "./agent-scene";
import { CopyCommand } from "./copy-command";
import { CountUp } from "./count-up";
import {
  IconBroadcast,
  IconCard,
  IconChart,
  IconCheck,
  IconClock,
  IconEye,
  IconGlobe,
  IconLaptop,
  IconLock,
  IconMonitor,
  IconRoute,
  IconShield,
  IconTerminal,
  IconUsers,
} from "./icons";
import { Reveal } from "./reveal";
import { N8BUILDS_URL, RELEASE_URL, REPO_URL, SITE_URL, WAITLIST_URL } from "./site";

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

/** The VibeLog mark: same artwork as app/icon.svg (the favicon) and the share card. */
function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="vl-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a06bff" />
          <stop offset="1" stopColor="#2ee6b6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#vl-g)" />
      <path d="M18 22l9 22 4-10 4 10 11-22" fill="none" stroke="#07060d" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={`inline-flex min-h-11 items-center rounded-md px-3 text-[15px] font-semibold text-muted underline-offset-4 transition hover:text-ink hover:underline ${focusRing}`}>
      {children}
    </a>
  );
}

function Eyebrow({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return <p className={`slate text-accent ${center ? "text-center" : ""}`}>{children}</p>;
}

function Audience({ kind }: { kind: "stream" | "public" | "private" | "social" }) {
  const map = {
    stream: { text: "On stream", icon: <IconBroadcast className="size-3.5" />, cls: "border-tally/50 text-[#ff8a8a]" },
    public: { text: "Public link", icon: <IconGlobe className="size-3.5" />, cls: "border-teal/40 text-teal" },
    private: { text: "Only you", icon: <IconLock className="size-3.5" />, cls: "border-line-2 text-muted" },
    social: { text: "Social post", icon: <IconCard className="size-3.5" />, cls: "border-accent/50 text-accent" },
  }[kind];
  return (
    <span className={`slate inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 ${map.cls}`}>
      {map.icon}
      {map.text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const AUDIENCES = [
  { icon: IconBroadcast, title: "Streamers", body: "You code on Twitch or YouTube with an agent doing a lot of the typing. Viewers see what it is doing and what got shipped." },
  { icon: IconUsers, title: "Builders in public", body: "You post progress on X or Discord. A card with today's work beats a screenshot of a terminal." },
  { icon: IconTerminal, title: "Anyone pairing with an agent", body: "No audience needed. The dashboard is a quiet record of what you and your agents built, day by day." },
];

const SCENES = [
  {
    id: "hud",
    icon: IconMonitor,
    name: "Stream overlay",
    route: "localhost:4545/overlay",
    audience: "stream" as const,
    body: "A transparent OBS Browser Source along the bottom of your scene: what you are building, the latest milestones, and live numbers from git and your agent session. It refreshes every few seconds.",
    img: { src: "/shots/hud-detail.webp", w: 1785, h: 435, alt: "The overlay: a Now Building panel with recent milestones, and live stats for features, commits, prompts, sub-agents and tokens." },
  },
  {
    id: "live",
    icon: IconGlobe,
    name: "Live page",
    route: "/live",
    audience: "public" as const,
    body: "A page anyone can open: your headline, what you are on right now, today's numbers and the build feed. Share it with a read-only tunnel (vibe share) or publish snapshots to a Cloudflare Worker you own.",
    img: { src: "/shots/live.webp", w: 1600, h: 1075, alt: "The live page: a large Now Building headline, Map preview cards for each trail, above stat tiles and the build feed." },
  },
  {
    id: "dashboard",
    icon: IconChart,
    name: "Dashboard",
    route: "localhost:4545/dashboard",
    audience: "private" as const,
    body: "Your history: agent tokens per day for the past year, sessions, streaks, stream time and per-project activity. It only answers on your own machine. Shown with the built-in demo data.",
    img: { src: "/shots/dashboard-demo.webp", w: 1800, h: 1373, alt: "The private dashboard with a year-long activity heatmap, session stats, the week and channel growth, using demo data." },
  },
  {
    id: "share",
    icon: IconCard,
    name: "Share card",
    route: "/share/card.png",
    audience: "social" as const,
    body: "A 1200 by 630 image for your post that points people at your channel: Watch live on Twitch (or Follow, when you are offline) with your handle, plus what you are building. VibeLog is a small mark in the corner.",
    img: { src: "/shots/share-card.webp", w: 1200, h: 630, alt: "A share card: Your Name, Follow on Twitch, twitch.tv/yourchannel, Building: Map preview cards for each trail, and a small VibeLog mark." },
  },
];

const STEPS = [
  { n: "1", title: "Install", body: "You need Node and git. It runs from the repo for now.", lines: [`git clone ${REPO_URL}`, "cd vibelog && npm install"] },
  {
    n: "2",
    title: "Start a session in your project",
    body: "Then add a Browser Source in OBS for http://localhost:4545/overlay at 1920 by 1080.",
    lines: ["npm run vibe -- start --cwd ~/code/my-app"],
  },
  {
    n: "3",
    title: "Connect your agent and code",
    body: "This adds Claude Code hooks, so each prompt and sub-agent reaches VibeLog (other agents are on the roadmap). Mark wins as you go; vibe report gives you the recap.",
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
      "Claude Code sessions: prompts, sub-agents, tokens",
      "Overlay, live page, dashboard, share cards",
      "Secret scrubbing before anything reaches a page",
      "Daily and weekly recaps (vibe report)",
    ],
  },
  {
    title: "Built, not yet verified",
    note: "The code is there; not tested with real accounts",
    tone: "text-[#ffc46b]",
    items: [
      "OBS stream time over the OBS WebSocket",
      "Twitch and YouTube live status and followers",
      "Discord and GitHub connect",
      "AI summaries with a Gemini key",
      "Publishing the live page to your own Worker",
    ],
  },
  {
    title: "Planned",
    note: "Not built yet",
    tone: "text-muted",
    items: [
      "More agents: Codex, Gemini CLI and others",
      "A one-line install",
      "macOS and Linux setup guides",
      "A hosted live page, no Worker of your own",
    ],
  },
];

const FAQ = [
  {
    q: "Which agents does it track?",
    a: "Claude Code today, through its hooks and the transcripts it writes to your disk. More agents (Codex, Gemini CLI and others) are planned. Git stats work whatever you code with.",
  },
  {
    q: "Which systems does it run on?",
    a: "It is built and tested on Windows with WSL. macOS and Linux should work, since it is Node and git, but nobody has tested them yet.",
  },
  {
    q: "Does anything leave my machine?",
    a: "Not by default. Pages are served from localhost. Viewers only see something if you open a tunnel (vibe share) or publish snapshots to your own Worker, and then only the public numbers and labels.",
  },
  {
    q: "Is dollar spend shown?",
    a: "Never on a public page, the embed, share cards or published snapshots, unless you turn it on. Your dashboard shows it, and your overlay can, because they read your own machine.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. It is MIT licensed and runs on your machine. A hosted live page may come later.",
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
    "Live stats for coding with AI agents: a stream overlay, a public live page, a private dashboard and share cards, from your git repo and agent session.",
  license: "https://opensource.org/licenses/MIT",
  softwareVersion: "0.1.0",
  datePublished: "2026-11-02",
  codeRepository: REPO_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", name: "N8", url: N8BUILDS_URL },
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Reveal />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <nav aria-label="Primary" className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className={`flex items-center gap-2.5 rounded-sm ${focusRing}`}>
            <Logo className="size-7" />
            <span className="text-[17px] font-bold tracking-tight">VibeLog</span>
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
        {/* Hero: centred copy, then the scene */}
        <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden border-b border-line">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(50%_60%_at_50%_0%,rgba(177,140,255,0.13),transparent_70%)]" />
          <div className="relative mx-auto max-w-3xl px-4 pt-12 text-center sm:px-6 sm:pt-14">
            <h1 id="hero-title" className="display text-[clamp(2.6rem,7vw,4rem)]">
              Your coding session,
              <br />
              <span className="text-accent">live on stream.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[44rem] text-[17px] leading-relaxed text-pretty text-muted">
              VibeLog follows your repo and your AI agent session and shows what you are building, with prompts, commits, sub-agents and
              tokens. On your stream, on a page you can share, and on a card for your channel.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <StarButton />
              <TextLink href="#how">How it works</TextLink>
            </div>
          </div>

          <div className="relative mx-auto mt-9 max-w-5xl px-4 pb-16 sm:px-6">
            <AgentScene />
          </div>
        </section>

        {/* Who it is for: centred heading, three-up grid */}
        <section aria-labelledby="who-title" className="border-b border-line bg-bg-2">
          <div className="reveal mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
            <Eyebrow center>Who it&apos;s for</Eyebrow>
            <h2 id="who-title" className="display mx-auto mt-3 max-w-2xl text-center text-[clamp(2rem,4.6vw,3.25rem)]">
              Anyone vibe coding with an agent.
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {AUDIENCES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-sm border border-line bg-bg p-5">
                  <span className="grid size-9 place-items-center rounded-md border border-line-2 bg-bg-3 text-accent">
                    <Icon className="size-[18px]" />
                  </span>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Product: zig-zag rows */}
        <section id="product" aria-labelledby="product-title" className="border-b border-line">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="reveal max-w-[38rem]">
              <Eyebrow>What you get</Eyebrow>
              <h2 id="product-title" className="display mt-3 text-[clamp(2rem,4.6vw,3.25rem)]">
                One local process. Four views.
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Each one is for a different audience, so each one shows different things. These are real captures from a test session.
              </p>
            </div>

            <ol className="mt-14 space-y-20 sm:space-y-24">
              {SCENES.map((s, i) => {
                const flip = i % 2 === 1;
                const Icon = s.icon;
                return (
                  <li key={s.id} id={`view-${s.id}`} className="reveal grid items-center gap-8 lg:grid-cols-12 lg:gap-12 [&>*]:min-w-0">
                    <div className={`lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-md border border-line-2 bg-bg-3 text-accent">
                          <Icon className="size-[18px]" />
                        </span>
                        <Audience kind={s.audience} />
                      </div>
                      <h3 className="display mt-5 text-[2.25rem] normal-case">{s.name}</h3>
                      <p className="mt-1 font-mono text-[13px] text-accent">{s.route}</p>
                      <p className="mt-4 max-w-[30rem] leading-relaxed text-muted">{s.body}</p>
                    </div>
                    <figure className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
                      {s.id === "live" ? (
                        <div className="relative pr-[14%]">
                          <Image src={s.img.src} alt={s.img.alt} width={s.img.w} height={s.img.h} sizes="(min-width: 1024px) 520px, 85vw" className="h-auto w-full rounded-sm border border-line" />
                          <Image
                            src="/shots/live-phone.webp"
                            alt="The same live page on a phone."
                            width={780}
                            height={1400}
                            sizes="(min-width: 1024px) 140px, 25vw"
                            className="absolute right-0 -bottom-6 h-auto w-[26%] rounded-[14px] border-4 border-[#1e1f27] shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                          />
                        </div>
                      ) : s.id === "hud" ? (
                        <div className="rounded-sm border border-line bg-[repeating-linear-gradient(45deg,#121218_0_12px,#0f0f14_12px_24px)] p-3 sm:p-5">
                          <Image src={s.img.src} alt={s.img.alt} width={s.img.w} height={s.img.h} sizes="(min-width: 1024px) 600px, 100vw" className="h-auto w-full" />
                        </div>
                      ) : (
                        <Image
                          src={s.img.src}
                          alt={s.img.alt}
                          width={s.img.w}
                          height={s.img.h}
                          sizes="(min-width: 1024px) 600px, 100vw"
                          className={`h-auto w-full rounded-sm border border-line ${s.id === "share" ? "shadow-[0_24px_60px_rgba(0,0,0,0.5)] lg:rotate-[-1.2deg]" : ""}`}
                        />
                      )}
                    </figure>
                  </li>
                );
              })}
            </ol>

            {/* The numbers behind the screenshots */}
            <div className="reveal mt-24 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-4">
              {[
                { n: 4, s: "", l: "prompts" },
                { n: 2, s: "", l: "sub-agents" },
                { n: 3, s: "", l: "commits" },
                { n: 443900, s: "", l: "tokens" },
              ].map((x) => (
                <div key={x.l} className="bg-bg px-5 py-6 text-center">
                  <div className="display text-4xl text-ink normal-case">
                    <CountUp to={x.n} suffix={x.s} />
                  </div>
                  <div className="slate mt-2 text-dim">{x.l}</div>
                </div>
              ))}
              <p className="col-span-2 bg-bg px-5 py-3 text-center text-sm text-dim sm:col-span-4">The test session behind these screenshots, as VibeLog counted it.</p>
            </div>
          </div>
        </section>

        {/* How it works: narrow centred timeline */}
        <section id="how" aria-labelledby="how-title" className="border-b border-line bg-bg-2">
          <div className="reveal mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
            <Eyebrow center>How it works</Eyebrow>
            <h2 id="how-title" className="display mt-3 text-center text-[clamp(2rem,4.6vw,3.25rem)]">
              Three steps.
            </h2>
            <ol className="relative mt-12 space-y-10 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line-2">
              {STEPS.map((s) => (
                <li key={s.n} className="relative grid grid-cols-[32px_1fr] gap-5 [&>*]:min-w-0">
                  <span className="relative z-10 grid size-8 place-items-center rounded-full border border-accent/60 bg-bg font-mono text-sm font-bold text-accent">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-1.5 mb-4 text-[15px] leading-relaxed text-muted">{s.body}</p>
                    <CopyCommand lines={s.lines} label={`Step ${s.n}`} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-10 text-center text-sm text-dim">
              Just looking? <code className="font-mono text-muted">npm run vibe -- demo</code> shows every view with sample data.
            </p>
          </div>
        </section>

        {/* Privacy: table left, points right */}
        <section id="privacy" aria-labelledby="privacy-title" className="border-b border-line">
          <div className="mx-auto grid max-w-5xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-12 lg:items-center">
            <div className="reveal lg:order-2 lg:col-span-6">
              <Eyebrow>Privacy</Eyebrow>
              <h2 id="privacy-title" className="display mt-3 text-[clamp(2rem,4.6vw,3.25rem)]">
                Your machine is the server.
              </h2>
              <ul className="mt-6 space-y-5 text-[15px] leading-relaxed">
                {[
                  { icon: IconLaptop, t: "Local by default", d: "One Node process on localhost. No account and no cloud. Token counts come from transcripts already on your disk." },
                  { icon: IconShield, t: "Scrubbed before it's shown", d: "Text for any page passes a secret scrubber and a length cap. Prompts, code, file paths and keys never reach a public page." },
                  { icon: IconEye, t: "Viewers can only look", d: "Tunnel and network visitors get read-only pages, and other websites in your browser can't write to your overlay or read your dashboard." },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-4">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-line-2 bg-bg-3 text-teal">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <strong className="block font-semibold text-ink">{t}</strong>
                      <span className="text-muted">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="reveal overflow-hidden rounded-sm border border-line lg:order-1 lg:col-span-6">
              <table className="w-full text-left text-[15px]">
                <caption className="sr-only">What stays on your machine and what viewers can see</caption>
                <thead className="bg-bg-2">
                  <tr>
                    <th scope="col" className="slate px-4 py-3 font-semibold text-muted">Data</th>
                    <th scope="col" className="slate px-4 py-3 font-semibold text-muted">Viewers see</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[
                    ["Your prompts", "A short label, scrubbed"],
                    ["Code, diffs, file paths", "Never"],
                    ["API keys and tokens", "Never"],
                    ["Commits, lines, files", "Counts only"],
                    ["Agent tokens", "A total"],
                    ["Dollar spend", "Only if you opt in"],
                    ["History, per-project data", "Never"],
                  ].map(([d, v]) => (
                    <tr key={d}>
                      <th scope="row" className="px-4 py-3 font-medium">{d}</th>
                      <td className={`px-4 py-3 ${v === "Never" ? "text-teal" : "text-muted"}`}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Open source: centred card */}
        <section id="open-source" aria-labelledby="oss-title" className="border-b border-line bg-bg-2">
          <div className="reveal mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
            <Logo className="mx-auto size-12" />
            <h2 id="oss-title" className="display mt-6 text-[clamp(2rem,4.6vw,3.25rem)]">
              Open source. MIT.
            </h2>
            <p className="mx-auto mt-4 max-w-[34rem] leading-relaxed text-muted">
              A tool that watches your repo and your prompts should be one you can read. The code has been public since November 1, 2026, and
              v0.1.0 came out on November 2.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
              <StarButton />
              <TextLink href={RELEASE_URL}>v0.1.0 release notes</TextLink>
            </div>
            <dl className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line text-left">
              {[
                { k: "License", v: "MIT", icon: IconCheck },
                { k: "Version", v: "0.1.0", icon: IconRoute },
                { k: "Public since", v: "Nov 2026", icon: IconClock },
                { k: "Tested on", v: "WSL", icon: IconLaptop },
              ].map(({ k, v, icon: Icon }) => (
                <div key={k} className="bg-bg p-4">
                  <dt className="slate flex items-center gap-1.5 text-dim">
                    <Icon className="size-3.5" />
                    {k}
                  </dt>
                  <dd className="mt-1.5 font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Roadmap: three-up grid */}
        <section id="roadmap" aria-labelledby="roadmap-title" className="border-b border-line">
          <div className="reveal mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Roadmap</Eyebrow>
                <h2 id="roadmap-title" className="display mt-3 text-[clamp(2rem,4.6vw,3.25rem)]">
                  What works, what doesn&apos;t yet.
                </h2>
              </div>
              <a href={WAITLIST_URL} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
                Hear about the hosted version
              </a>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {ROADMAP.map((col) => (
                <div key={col.title} className="rounded-sm border border-line bg-bg-2 p-6">
                  <h3 className={`slate ${col.tone}`}>{col.title}</h3>
                  <p className="mt-1 text-sm text-dim">{col.note}</p>
                  <ul className="mt-5 space-y-3 text-[15px]">
                    {col.items.map((i) => (
                      <li key={i} className="flex gap-3">
                        <span aria-hidden="true" className={`mt-[0.6em] h-px w-3 shrink-0 bg-current ${col.tone}`} />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ: narrow column */}
        <section id="faq" aria-labelledby="faq-title" className="border-b border-line bg-bg-2">
          <div className="reveal mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
            <Eyebrow center>Questions</Eyebrow>
            <h2 id="faq-title" className="display mt-3 text-center text-[clamp(2rem,4.6vw,3.25rem)]">
              Fair questions.
            </h2>
            <div className="mt-10 divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold ${focusRing}`}>
                    {f.q}
                    <span aria-hidden="true" className="font-mono text-accent transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-4 text-[15px] leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 text-sm text-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2">
          <Logo className="size-5" />
          <span>
            Built by N8 at{" "}
            <a href={N8BUILDS_URL} className="text-muted underline-offset-4 hover:text-ink hover:underline">
              n8builds.dev
            </a>
            . MIT licensed.
          </span>
        </p>
        <a href={REPO_URL} className="inline-flex items-center gap-2 text-muted hover:text-ink">
          <GitHubMark />
          n8watkins/vibelog
        </a>
      </footer>
    </>
  );
}
