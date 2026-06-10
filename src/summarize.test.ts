import { test } from "node:test";
import assert from "node:assert/strict";
import { templateSummary, sanitizeLabel } from "./summarize.ts";

test("templateSummary strips polite filler and title-cases", () => {
  assert.equal(templateSummary("can you add discord oauth to the login page"), "Add discord oauth to the login page");
  assert.equal(templateSummary("please fix the double-count bug"), "Fix the double-count bug");
  assert.equal(templateSummary("let's wire the stats card"), "Wire the stats card");
});

test("templateSummary ignores code blocks and uses the first real line", () => {
  const prompt = "```\nconst x = 1;\n```\nrefactor the token poller";
  assert.equal(templateSummary(prompt), "Refactor the token poller");
});

test("templateSummary caps length and word count, never empty", () => {
  const out = templateSummary("build " + "really ".repeat(20) + "long feature");
  assert.ok(out.split(" ").length <= 9);
  assert.ok(out.length <= 90);
  assert.equal(templateSummary("```\njust code\n```"), "Vibe coding");
  assert.equal(templateSummary("   "), "Vibe coding");
});

test("sanitizeLabel strips quotes and trailing punctuation", () => {
  assert.equal(sanitizeLabel('"Adding Discord OAuth."'), "Adding Discord OAuth");
  assert.equal(sanitizeLabel("wiring   the\tstats card  "), "Wiring the stats card");
});
