# Changelog

## 0.1.0 - 2026-11-02

First release of VibeLog: a local OBS overlay, private dashboard and public /live page that show what you are building on stream, plus share cards, an embeddable widget and a Cloudflare Worker that keeps /live up 24/7. Self-host is free; the landing page is at vibelogs.dev.

### New

- Bundle DejaVu Sans so share cards render deterministically
- Add Share entry points to /live + dashboard
- Point GitHub CTA at the real repo + add footer link
- Add a third "My VibeLog" profile card
- Add local-LLM provider abstraction (PR1/Task A)
- Add Cloudflare Worker + KV snapshot host (PR3/Task C)
- Add snapshot publisher (PR2 — Task B)
- Add G4 embeddable live widget + loader script
- Serve the G4 embed widget 24/7 from KV-backed Worker
- Add embed-code generator to /share (the G4 front door)
- Serve the landing page as the public front door
- Configure the local/Gemini summarizer from the dashboard
- Milestone moment toasts on the OBS overlay
- Read-only VibeLog MCP server spike (get_state)
- Theme write tools — re-skin the overlay from Claude
- AI day recap via the shared summarizer provider chain
- Add a 4th 'recap' share-card kind (this-week bars + streak)
- Add an embed-snippet card with a copy button
- Self-analytics on-stream pack — peak viewers, personal-best record, growth sparkline
- Add Next.js 16 landing page with real product screenshots
- Hide dollar spend on public surfaces by default
- Two paths, vibelogs.dev and private spend FAQ
- Deploy to vibelogs.dev on Cloudflare Workers

### Fixed

- Gate per-render snapshot build + await final publish on shutdown
- Detect new build-log milestones by identity, not length
- Enforce loopback baseUrl at use-time, not just on write
- Re-probe local model on each Detect; tidy the settings UX
- Honor the active agent port for get_state
- Set_theme warns when per-page sync is off (no silent no-op)
- Anchor templateRecap's counts-line match on the ✨ marker
- Stop the recap card strip overlapping the "powered by" footer
- Stop dashboard panels clipping, cramped month labels and /live mobile overflow
- Tidy the public-spend toggle and point examples at vibelogs.dev

### Faster

- Edge-cache JSON GETs so viewer polls don't re-read KV

