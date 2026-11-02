import Image from "next/image";
import { N8BUILDS_URL, SITE_URL, WAITLIST_URL } from "./site";

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function WaitlistButton({ children = "Join early access", className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <a
      href={WAITLIST_URL}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-pink px-6 py-3 text-sm font-bold text-bg shadow-[0_0_32px_rgba(160,107,255,0.45)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal ${className}`}
    >
      {children}
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white/[0.03] px-6 py-3 text-sm font-semibold text-ink transition hover:border-accent/60 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
    >
      {children}
    </a>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs font-semibold tracking-[0.2em] text-pink uppercase">{children}</p>;
}

function SectionHeading({ eyebrow, title, intro, id }: { eyebrow: string; title: React.ReactNode; intro?: React.ReactNode; id: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {intro ? <p className="mt-4 text-base leading-relaxed text-pretty text-muted sm:text-lg">{intro}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: "first" | "planned" }) {
  return status === "first" ? (
    <span className="inline-flex items-center rounded-full border border-accent/50 bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-ink uppercase">
      Available first
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-teal/40 bg-teal/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-teal uppercase">
      Planned
    </span>
  );
}

function Shot({
  src,
  alt,
  width,
  height,
  caption,
  priority = false,
  sizes,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  priority?: boolean;
  sizes: string;
}) {
  return (
    <figure className="ring overflow-hidden rounded-2xl border border-line bg-bg-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
      <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes={sizes} className="h-auto w-full" />
      {caption ? (
        <figcaption className="border-t border-line px-4 py-2.5 font-mono text-xs text-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                              */
/* ------------------------------------------------------------------ */

const steps = [
  {
    n: "01",
    title: "Run the agent next to your editor",
    body: "One local Node process watches your repos, your Claude Code token spend, OBS and your Twitch or YouTube channel. No account needed.",
  },
  {
    n: "02",
    title: "Drop the HUD into OBS",
    body: "Add one Browser Source. Viewers who join mid-stream instantly see what you are building, how far you got and what it cost.",
  },
  {
    n: "03",
    title: "Share it, if you want to",
    body: "Post a share card, embed a live widget on your site, or publish a public page. Nothing leaves your machine until you choose to publish.",
  },
];

const featureGroups = [
  {
    title: "Collect",
    tone: "text-teal",
    items: [
      "Git lines, files, commits and branch, per project",
      "Claude Code tokens and cost, attributed per repo",
      "Stream time from OBS WebSocket",
      "Twitch and YouTube followers, subs and live viewers",
      "A short now-building label from your prompt, redacted",
    ],
  },
  {
    title: "Show",
    tone: "text-accent",
    items: [
      "OBS HUD with live stats, projects and milestone toasts",
      "Private dashboard with a year heatmap and weekly view",
      "Public /live page with live and offline states",
      "Server-rendered share cards that unfurl on X",
      "A one-line embeddable widget for your own site",
    ],
  },
  {
    title: "Make it yours",
    tone: "text-pink",
    items: [
      "10 theme presets plus randomize",
      "Custom colors, validated so nothing can inject CSS",
      "Separate themes per surface, or keep them synced",
      "Profile: name, bio, X handle, channel header",
      "Terminal recaps: daily, weekly and a streak chart",
    ],
  },
  {
    title: "Trust by design",
    tone: "text-live",
    items: [
      "Local-first: nothing is uploaded by default",
      "Every public string passes a secret redactor",
      "Remote viewers only reach read-only public routes",
      "Keys live in a chmod 600 file, never in env vars",
      "An MCP server so Claude can read your stats",
    ],
  },
];

type Cell = "yes" | "no" | "partial" | string;

const comparison: { label: string; vibelog: Cell; wakatime: Cell; overlays: Cell; trackers: Cell }[] = [
  { label: "Live OBS overlay", vibelog: "yes", wakatime: "no", overlays: "yes", trackers: "no" },
  { label: "Git activity", vibelog: "yes", wakatime: "partial", overlays: "no", trackers: "no" },
  { label: "AI token spend", vibelog: "yes", wakatime: "partial", overlays: "no", trackers: "yes" },
  { label: "Stream time and channel growth", vibelog: "yes", wakatime: "no", overlays: "partial", trackers: "no" },
  { label: "Public live page", vibelog: "yes", wakatime: "no", overlays: "no", trackers: "partial" },
  { label: "Share cards", vibelog: "yes", wakatime: "partial", overlays: "no", trackers: "partial" },
  { label: "Runs fully on your machine", vibelog: "yes", wakatime: "no", overlays: "no", trackers: "yes" },
];

const paths = [
  {
    name: "Self-host",
    price: "Free",
    period: "open source",
    status: "first" as const,
    blurb: "Run everything yourself, on your machine and your own Cloudflare account.",
    items: [
      "Agent, OBS HUD, dashboard and recaps",
      "Themes and profile",
      "/live, /share and the embed widget from your machine",
      "Your public page on your own free Cloudflare Worker",
      "No account, no telemetry",
    ],
    cta: "Get notified at release",
    featured: true,
  },
  {
    name: "Hosted by us",
    price: "$6",
    period: "per month",
    status: "planned" as const,
    blurb: "We run the public page, so it stays up when your laptop is off.",
    items: [
      "Everything in self-host, nothing to deploy",
      "Your page at a VibeLog handle, always on",
      "Custom domain with SSL",
      "Full public history and near real-time updates",
      "Hosted share-card images and link unfurls",
      "14-day free trial",
    ],
    cta: "Join the hosted waitlist",
    featured: false,
  },
];

const faqs = [
  {
    q: "Is VibeLog a keylogger?",
    a: "No. It reads git commits and diff counts, token counts from your local Claude Code logs, OBS stream state and your channel stats. It never reads keystrokes or file contents. The only free-text it shows is a short label made from your prompt, which passes a secret redactor and a 140 character cap, and you can switch it to a no-AI template.",
  },
  {
    q: "Does anything leave my machine?",
    a: "Not by default. The overlay and dashboard are served from localhost. If you choose to publish, the agent sends a small snapshot with your public profile fields, numbers and theme, never prompts, file paths, diffs or keys.",
  },
  {
    q: "Will viewers see how much I spend on AI?",
    a: "Not unless you want them to. Dollar spend is hidden by default on every public surface: the /live page, share cards, the embed widget and anything you publish. Token counts stay visible. Your private dashboard and your local HUD still show spend, and one setting (in the dashboard, or vibe privacy cost show) turns it back on publicly.",
  },
  {
    q: "What is the difference between self-hosting and hosted?",
    a: "Self-hosting is free and comes first: you run the agent and, if you want an always-on page, deploy it to your own Cloudflare account. Hosted by us is a planned paid plan for people who would rather not deploy anything; we keep the page up, add a custom domain and keep the full history.",
  },
  {
    q: "Which AI tools does it track?",
    a: "Claude Code today, including per-project attribution. Support for Codex, Gemini CLI and other agents is planned next.",
  },
  {
    q: "Do I need to stream to use it?",
    a: "No. The dashboard, recaps, share cards and public page are useful on their own if you build in public on X, GitHub or your own site. Streaming just makes the HUD the star.",
  },
  {
    q: "What platforms does it run on?",
    a: "Anywhere Node 22+ runs. It is developed on Windows with WSL, where OBS on Windows reads the HUD from the WSL agent. macOS and Linux guides are planned alongside the public release.",
  },
  {
    q: "When can I get it?",
    a: "The product works today and is being prepared for an open-source release. Join the early-access list on n8builds.dev and you will hear when the source and the installable CLI are out.",
  },
  {
    q: "Are the numbers in the screenshots real?",
    a: "The screenshots are the real product running in its built-in demo mode, so the interface is genuine and the numbers are sample data.",
  },
];

function CellMark({ v }: { v: Cell }) {
  if (v === "yes")
    return (
      <span className="inline-flex items-center gap-1.5 align-middle text-teal">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Yes</span>
      </span>
    );
  if (v === "no")
    return (
      <span className="text-muted/60">
        <span aria-hidden="true">-</span>
        <span className="sr-only">No</span>
      </span>
    );
  if (v === "partial") return <span className="text-xs font-medium text-muted">Partial</span>;
  return <span>{v}</span>;
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "VibeLog",
  url: SITE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Windows, macOS, Linux",
  description:
    "Local-first OBS overlay, public live page and share cards that show what you are building with AI, with real git and token numbers.",
  author: { "@type": "Person", name: "N8", url: N8BUILDS_URL },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-xl">
        <nav aria-label="Primary" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <span aria-hidden="true" className="size-6 rounded-lg bg-gradient-to-br from-accent to-teal shadow-[0_0_18px_rgba(124,92,255,0.55)]" />
            VibeLog
          </a>
          <ul className="hidden items-center gap-7 text-sm text-muted md:flex">
            <li><a className="transition hover:text-ink" href="#how">How it works</a></li>
            <li><a className="transition hover:text-ink" href="#features">Features</a></li>
            <li><a className="transition hover:text-ink" href="#open-source">Open source</a></li>
            <li><a className="transition hover:text-ink" href="#pricing">Pricing</a></li>
            <li><a className="transition hover:text-ink" href="#faq">FAQ</a></li>
          </ul>
          <a
            href={WAITLIST_URL}
            className="inline-flex min-h-10 items-center rounded-full border border-accent/50 bg-accent/10 px-4 text-sm font-semibold text-ink transition hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
          >
            Early access
          </a>
        </nav>
      </header>

      <main id="main" className="aurora overflow-x-clip">
        {/* Hero */}
        <section id="top" aria-labelledby="hero-title" className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3.5 py-1.5 font-mono text-xs text-muted">
              <span aria-hidden="true" className="size-2 rounded-full bg-live shadow-[0_0_10px_var(--color-live)] motion-safe:animate-pulse" />
              For people who build with AI in public
            </p>
            <h1 id="hero-title" className="mt-6 text-5xl font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Proof of work, <span className="text-gradient">live.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted sm:text-xl">
              VibeLog shows what you are building with AI, with real git and token numbers, on your stream and on a public page.
              Nothing leaves your machine unless you publish it.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <WaitlistButton />
              <GhostButton href="#how">See how it works</GhostButton>
            </div>
            <p className="mt-4 text-sm text-balance text-muted">Free to self-host, available first. Hosted by us comes later.</p>
          </div>

          <div className="relative mx-auto mt-14 max-w-5xl md:pb-24">
            <Shot
              src="/shots/live.png"
              alt="The VibeLog public live page with a now-building headline, stat tiles for features, commits, tokens, prompts, sub-agents and streak, a projects list and a build feed"
              width={1440}
              height={900}
              priority
              sizes="(min-width: 1080px) 1024px, 100vw"
            />
            <div className="mt-4 md:absolute md:right-[-2%] md:bottom-0 md:left-[6%] md:mt-0">
              <figure className="ring overflow-hidden rounded-xl border border-line bg-bg-2 shadow-[0_30px_90px_rgba(0,0,0,0.75)]">
                <Image
                  src="/shots/hud-strip.png"
                  alt="The VibeLog OBS HUD strip: projects ticker, a now-building card, and live stats for features, commits, prompts, sub-agents, tokens, spend and day streak"
                  width={1920}
                  height={320}
                  priority
                  sizes="(min-width: 1080px) 984px, 100vw"
                  className="h-auto w-full"
                />
              </figure>
            </div>
          </div>
          <p className="mt-5 text-center font-mono text-xs text-muted">The public /live page, with the OBS HUD strip in front. Real product, demo data.</p>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="border-t border-line/60 bg-bg-2/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="how-title"
              eyebrow="How it works"
              title="Collect locally. Show anywhere."
              intro="The agent that reads your machine never moves to the cloud. Only the public surface does, and only when you say so."
            />
            <ol className="mt-14 grid gap-5 md:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-2xl border border-line bg-panel p-6 backdrop-blur">
                  <span className="font-mono text-sm font-semibold text-accent">{s.n}</span>
                  <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Screens */}
        <section aria-labelledby="screens-title" className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="screens-title"
              eyebrow="The surfaces"
              title="One agent, four places to be seen"
              intro="Everything below is a screenshot of the running product."
            />
            <div className="mt-14 grid gap-8 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <h3 className="mb-3 text-lg font-bold">OBS HUD</h3>
                <Shot
                  src="/shots/hud.png"
                  alt="The full 1920 by 1080 VibeLog OBS overlay: a corner milestone toast, a camera frame with a personal-best badge, a projects ticker, a now-building card and live stats"
                  width={1600}
                  height={900}
                  sizes="(min-width: 1080px) 1104px, 100vw"
                />
                <p className="mt-3 text-muted">A transparent 1920x1080 Browser Source. The open area is your editor and camera; VibeLog keeps to the bottom strip and a corner toast.</p>
              </div>
              <div className="min-w-0">
                <h3 className="mb-3 text-lg font-bold">Public /live page</h3>
                <Shot
                  src="/shots/live.png"
                  alt="The VibeLog public live page with a now-building headline, stat tiles for features, commits, tokens, prompts, sub-agents and streak, a projects list and a build feed"
                  width={1440}
                  height={900}
                  sizes="(min-width: 1024px) 560px, 100vw"
                />
                <p className="mt-3 text-muted">A link for your bio or chat. It shows an offline state when you are not live, so the URL is safe to share permanently.</p>
              </div>
              <div className="min-w-0">
                <h3 className="mb-3 text-lg font-bold">Share cards</h3>
                <Shot
                  src="/shots/share-card.png"
                  alt="A 1200 by 630 VibeLog share card showing features, time live, tokens, commits and what is being built"
                  width={1200}
                  height={630}
                  sizes="(min-width: 1024px) 560px, 100vw"
                />
                <p className="mt-3 text-muted">Rendered on the server as a PNG, painted with your theme, so links unfurl properly on X and Discord.</p>
              </div>
              <div className="lg:col-span-2">
                <h3 className="mb-3 text-lg font-bold">Private dashboard</h3>
                <Shot
                  src="/shots/dashboard.png"
                  alt="The VibeLog dashboard with a year-long activity heatmap of Claude tokens per day, totals, a session panel, a weekly streaming chart, channel growth sparklines and an embed snippet"
                  width={1440}
                  height={1198}
                  sizes="(min-width: 1080px) 1104px, 100vw"
                />
                <p className="mt-3 text-muted">Your year at a glance: AI usage, streaming and a combined score, per project. Localhost only.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="border-t border-line/60 bg-bg-2/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading id="features-title" eyebrow="Features" title="Everything a viewer asks, answered on screen" />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featureGroups.map((g) => (
                <div key={g.title} className="rounded-2xl border border-line bg-panel p-6">
                  <h3 className={`font-mono text-sm font-bold tracking-[0.15em] uppercase ${g.tone}`}>{g.title}</h3>
                  <ul className="mt-4 space-y-3">
                    {g.items.map((it) => (
                      <li key={it} className="flex gap-2.5 text-sm leading-relaxed text-ink/90">
                        <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open source */}
        <section id="open-source" aria-labelledby="oss-title" className="py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <Eyebrow>Open source, self-host first</Eyebrow>
              <h2 id="oss-title" className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Yours to run, read and fork
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                The agent is the part that touches your machine, so it will be open source.
                Read exactly what it collects, run it with no account, and host your public page on your own Cloudflare account for free.
                A hosted option comes later, for people who would rather not.
              </p>
              <ul className="mt-6 space-y-3 text-ink/90">
                {[
                  "No account and no telemetry to run the overlay",
                  "Keys stay in ~/.vibelog/secrets.json, never in env vars",
                  "Use a local LLM (Ollama, LM Studio) or no AI at all for labels",
                  "Self-host the public page on a Cloudflare Worker",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 size-4 shrink-0 text-teal" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted">The source release is in preparation. Early-access members hear first.</p>
            </div>
            <div className="ring min-w-0 overflow-hidden rounded-2xl border border-line bg-[#0a0913] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span aria-hidden="true" className="size-3 rounded-full bg-live/70" />
                <span aria-hidden="true" className="size-3 rounded-full bg-[#ffbd4a]/70" />
                <span aria-hidden="true" className="size-3 rounded-full bg-teal/70" />
                <span className="ml-2 font-mono text-xs text-muted">terminal</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7 text-ink/90">
                <code>
                  <span className="text-muted"># preview everything with demo data</span>
                  {"\n"}
                  <span className="text-pink">$</span> vibe demo
                  {"\n\n"}
                  <span className="text-muted"># start a real session in your repo</span>
                  {"\n"}
                  <span className="text-pink">$</span> vibe start --title <span className="text-teal">&quot;Share page&quot;</span>
                  {"\n\n"}
                  <span className="text-muted"># OBS Browser Source</span>
                  {"\n"}
                  <span className="text-accent">http://localhost:4545/overlay</span>
                  {"\n\n"}
                  <span className="text-muted"># mark progress, then recap</span>
                  {"\n"}
                  <span className="text-pink">$</span> vibe mark feature <span className="text-teal">&quot;share cards unfurl&quot;</span>
                  {"\n"}
                  <span className="text-pink">$</span> vibe report
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section aria-labelledby="compare-title" className="border-t border-line/60 bg-bg-2/60 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="compare-title"
              eyebrow="Comparison"
              title="The only tool that does all of it at once"
              intro="Stream overlays know nothing about code. Coding trackers have no audience surface. Token trackers stop at a number."
            />
            <p className="mt-10 text-center text-xs text-muted md:hidden">Swipe the table sideways to compare.</p>
            <div
              className="relative mt-3 overflow-x-auto rounded-2xl border border-line bg-panel focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal md:mt-12"
              role="region"
              aria-label="Comparison table"
              tabIndex={0}
            >
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Feature comparison between VibeLog and adjacent tools</caption>
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th scope="col" className="px-5 py-4 font-semibold">Capability</th>
                    <th scope="col" className="px-5 py-4 font-bold text-ink">VibeLog</th>
                    <th scope="col" className="px-5 py-4 font-semibold">Coding-time trackers</th>
                    <th scope="col" className="px-5 py-4 font-semibold">Stream overlay suites</th>
                    <th scope="col" className="px-5 py-4 font-semibold">AI token trackers</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((r) => (
                    <tr key={r.label} className="border-b border-line/60 last:border-0">
                      <th scope="row" className="px-5 py-3.5 font-medium text-ink/90">{r.label}</th>
                      <td className="bg-accent/[0.06] px-5 py-3.5"><CellMark v={r.vibelog} /></td>
                      <td className="px-5 py-3.5"><CellMark v={r.wakatime} /></td>
                      <td className="px-5 py-3.5"><CellMark v={r.overlays} /></td>
                      <td className="px-5 py-3.5"><CellMark v={r.trackers} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-center text-xs text-muted">
              Categories, not endorsements: for example WakaTime, Streamlabs, StreamElements, OWN3D and ccusage. Based on public product pages, November 2026.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="pricing-title"
              eyebrow="Pricing"
              title="Self-host free. Or let us host it."
              intro="Two paths, same product. Self-hosting is free, open source and comes first. The hosted plan is planned, not yet available, and its price may change before launch."
            />
            <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
              {paths.map((t) => (
                <div
                  key={t.name}
                  className={`flex flex-col rounded-2xl border p-7 ${t.featured ? "ring border-accent/50 bg-accent/[0.07]" : "border-line bg-panel"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold">{t.name}</h3>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold tracking-tight">{t.price}</span>
                    <span className="text-sm text-muted">{t.period}</span>
                  </p>
                  <p className="mt-3 text-muted">{t.blurb}</p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {t.items.map((it) => (
                      <li key={it} className="flex gap-2.5 text-ink/90">
                        <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-teal" fill="none" stroke="currentColor" strokeWidth="2.4">
                          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {it}
                      </li>
                    ))}
                  </ul>
                  {t.featured ? (
                    <WaitlistButton className="mt-8 w-full">{t.cta}</WaitlistButton>
                  ) : (
                    <a
                      href={WAITLIST_URL}
                      className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-white/[0.03] px-6 py-3 text-sm font-semibold transition hover:border-accent/60 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
                    >
                      {t.cta}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="border-t border-line/60 bg-bg-2/60 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered" />
            <div className="mt-12 divide-y divide-line rounded-2xl border border-line bg-panel">
              {faqs.map((f) => (
                <details key={f.q} className="group px-6">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
                    {f.q}
                    <span aria-hidden="true" className="faq-chevron text-xl leading-none text-accent transition-transform">+</span>
                  </summary>
                  <p className="pb-5 leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-title" className="py-20 sm:py-28">
          <div className="ring mx-4 max-w-4xl rounded-3xl border border-line bg-panel px-6 py-14 text-center sm:mx-auto sm:px-12">
            <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              Let people watch you <span className="text-gradient">ship.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Hear first when the self-host release ships, and get a spot in the hosted beta. One email when it is ready, no spam.
            </p>
            <div className="mt-8 flex justify-center">
              <WaitlistButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60 bg-bg">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:px-6">
          <p className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-5 rounded-md bg-gradient-to-br from-accent to-teal" />
            <span className="font-semibold text-ink">VibeLog</span>
            <span>Proof of work, live.</span>
          </p>
          <p>
            Built by N8 at{" "}
            <a href={N8BUILDS_URL} className="font-semibold text-ink underline decoration-accent/60 underline-offset-4 hover:decoration-accent">
              n8builds.dev
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
