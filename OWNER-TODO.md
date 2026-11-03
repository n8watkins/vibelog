# Owner to-do

Things only the owner can do for VibeLog: tests that need the owner's accounts or hardware.
VibeLog is on hiatus, so nothing here is urgent.
Agents keep this list current; tick an item by changing `[ ]` to `[x]` and adding the date.
No secrets go in this file: VibeLog reads its keys from `~/.vibelog/secrets.json` (see the Safety section of the README).
The cross-project list of keys to rotate is `SECURITY-TODO.md` in the private [secret-handling-review](https://github.com/n8watkins/secret-handling-review/blob/main/SECURITY-TODO.md) repo.

Last checked: 2026-11-02.
Done: `vibelogs.dev` is the canonical address with its landing page live (2026-11-01), and the repo is public under MIT.

## 1. When VibeLog resumes: tests that need your accounts or hardware

- [ ] OBS stream-time capture checked against a running OBS.
- [ ] Twitch and YouTube sign-in and follower polling checked with real apps.
- [ ] Discord and GitHub connect flows checked end to end.
- [ ] The Gemini summarizer checked with a real key in `~/.vibelog/secrets.json`.
- [ ] A live publish from the agent to the deployed Worker checked (it has had no snapshot since June 2026).

**What.**
The parts listed under "Not verified here" in [docs/ASSESSMENT_2026-11.md](docs/ASSESSMENT_2026-11.md).

**Steps.**
Run `vibe start` with OBS open and each account connected, and tell Claude what works and what does not; Claude sets up the apps' redirect URLs with you as needed.

**Why.**
They need your OBS, your streaming accounts and real API keys, which an agent cannot use for you.

**Unblocks.**
Calling those features working, and a public page that is no longer stale.
