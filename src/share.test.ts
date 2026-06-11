import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtNum,
  timeLiveLabel,
  xmlEscape,
  shareCardSvg,
  isShareKind,
  type ShareData,
} from "./share.ts";

test("fmtNum is compact and drops the decimal at 3 digits", () => {
  assert.equal(fmtNum(0), "0");
  assert.equal(fmtNum(-5), "0");
  assert.equal(fmtNum(12), "12");
  assert.equal(fmtNum(999), "999");
  assert.equal(fmtNum(4200), "4.2k");
  assert.equal(fmtNum(133_850), "134k"); // 3 scaled digits → no decimal (would overflow a column)
  assert.equal(fmtNum(1_300_000), "1.3M");
  assert.equal(fmtNum(150_000_000), "150M");
});

test("timeLiveLabel formats elapsed minutes/hours and tolerates junk", () => {
  const now = Date.parse("2026-06-10T12:00:00Z");
  assert.equal(timeLiveLabel(null, now), "—");
  assert.equal(timeLiveLabel("not-a-date", now), "—");
  assert.equal(timeLiveLabel("2026-06-10T11:13:00Z", now), "47m");
  assert.equal(timeLiveLabel("2026-06-10T07:48:00Z", now), "4.2h");
  assert.equal(timeLiveLabel("2026-06-10T11:00:00Z", now), "1h");
  // a future startedAt clamps to 0, never negative
  assert.equal(timeLiveLabel("2026-06-10T13:00:00Z", now), "0m");
});

test("xmlEscape neutralises the chars that could break out of SVG", () => {
  assert.equal(xmlEscape(`<script>&"'`), "&lt;script&gt;&amp;&quot;&apos;");
  assert.equal(xmlEscape(""), "");
});

test("isShareKind only accepts the known kinds", () => {
  assert.ok(isShareKind("stats"));
  assert.ok(isShareKind("join"));
  assert.ok(isShareKind("profile"));
  assert.ok(!isShareKind("evil"));
  assert.ok(!isShareKind(""));
});

const data = (over: Partial<ShareData> = {}): ShareData => ({
  displayName: "Nathan",
  channelHeader: "Building VibeLog",
  bio: "live coding",
  twitter: "nathan",
  live: true,
  nowBuilding: "the share card",
  stats: { features: 4, commits: 5, tokens: 133_850, timeLive: "47m" },
  theme: {},
  ...over,
});

test("shareCardSvg renders a 1200×630 SVG for every kind", () => {
  for (const kind of ["stats", "join", "profile"] as const) {
    const svg = shareCardSvg(kind, data());
    assert.ok(svg.startsWith("<svg"), "is an svg");
    assert.match(svg, /width="1200"/);
    assert.match(svg, /height="630"/);
  }
});

test("shareCardSvg escapes user-typed text — no raw injection survives", () => {
  const svg = shareCardSvg("stats", data({
    displayName: '<script>alert(1)</script>',
    nowBuilding: 'pwn & "quote" <tag>',
  }));
  assert.ok(!svg.includes("<script>"), "raw <script> must never appear");
  assert.ok(svg.includes("&lt;script&gt;"), "displayName is escaped");
  assert.ok(svg.includes("&amp;") && svg.includes("&quot;"), "nowBuilding is escaped");
});

test("profile card escapes the handle + bio and strips a leading @", () => {
  const svg = shareCardSvg("profile", data({
    twitter: "@@evil</text><script>x",
    bio: 'tag <b> & "q"',
    channelHeader: "Building things",
  }));
  assert.ok(!svg.includes("<script>"), "raw <script> must never appear");
  assert.ok(svg.includes("@evil"), "leading @s collapse to a single @");
  assert.ok(svg.includes("&amp;") && svg.includes("&quot;"), "bio is escaped");
});

test("shareCardSvg paints with the resolved theme colors", () => {
  const svg = shareCardSvg("stats", data({ theme: { "--bg": "#04100f", "--accent": "#2ee6c0" } }));
  assert.ok(svg.includes("#04100f"), "uses themed background");
  assert.ok(svg.includes("#2ee6c0"), "uses themed accent");
});

test("shareCardSvg falls back to default theme vars when unset", () => {
  const svg = shareCardSvg("join", data({ theme: {}, displayName: "VibeLog" }));
  // default --accent is #a06bff (see DEFAULT_THEME)
  assert.ok(svg.includes("#a06bff"), "default accent present");
});
