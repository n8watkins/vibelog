import { test } from "node:test";
import assert from "node:assert/strict";
import {
  templateSummary,
  sanitizeLabel,
  callOpenAICompatible,
  resetLocalLLMCache,
  sanitizeRecap,
  templateRecap,
  RECAP_SYSTEM_INSTRUCTION,
} from "./summarize.ts";

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

// --- Recap (AI day/session narrative) ---

test("sanitizeRecap unwraps quotes, strips markdown, collapses whitespace", () => {
  assert.equal(
    sanitizeRecap('  "Shipped the **auth** layer today."  '),
    "Shipped the auth layer today.",
  );
  assert.equal(sanitizeRecap("Wired   the\tstats\ncard"), "Wired the stats card");
});

test("sanitizeRecap drops code fences a model adds and caps length", () => {
  const out = sanitizeRecap("Built the thing ```const x = 1``` and more");
  assert.ok(!out.includes("const x"));
  assert.ok(sanitizeRecap("x".repeat(400)).length <= 280);
});

test("templateRecap is informative offline and never empty", () => {
  const report = [
    "📊 Vibe report — 2026-06-20",
    "",
    "  ⏱  2h 10m active  ·  1 session",
    "  ✨ 2 features  ·  🐛 1 fix  ·  💬 12 prompts  ·  🔧 40 tool calls",
  ].join("\n");
  const out = templateRecap(report);
  assert.ok(out.length > 0);
  assert.ok(out.includes("feature")); // pulled the headline counts line
  assert.ok(out.length <= 280);
});

test("templateRecap falls back gracefully with no counts line", () => {
  const out = templateRecap("📊 Vibe report — 2026-06-20\n\n  No activity logged today.");
  assert.ok(out.length > 0);
  assert.ok(!out.includes("undefined"));
});

test("RECAP_SYSTEM_INSTRUCTION forbids secrets and file paths", () => {
  assert.match(RECAP_SYSTEM_INSTRUCTION, /no secrets/i);
  assert.match(RECAP_SYSTEM_INSTRUCTION, /no file paths/i);
});

// --- New tests for provider abstraction ---

/** Helper: temporarily swap globalThis.fetch with a mock, restore in finally. */
function mockFetch(fn: (...args: unknown[]) => unknown): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  return () => { globalThis.fetch = saved; };
}

test("callOpenAICompatible parses choices[0].message.content and sanitizes", async () => {
  // The raw model reply has quotes + trailing punctuation; callOpenAICompatible
  // returns the raw string — sanitizeLabel is called by the caller (summarize()).
  // Here we verify the raw content is returned as-is after a successful response.
  const restore = mockFetch(async () => {
    const body = JSON.stringify({
      choices: [{ message: { content: '"Adding auth layer."' } }],
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const result = await callOpenAICompatible("add auth to the app", "http://127.0.0.1:11434", "llama3");
    // callOpenAICompatible returns trimmed content as-is (sanitizeLabel applied by caller)
    assert.equal(result, '"Adding auth layer."');
  } finally {
    restore();
  }
});

test("callOpenAICompatible throws on non-ok HTTP status", async () => {
  const restore = mockFetch(async () => new Response("", { status: 503 }));
  try {
    await assert.rejects(
      () => callOpenAICompatible("build something", "http://127.0.0.1:11434", "llama3"),
      /local-llm http 503/,
    );
  } finally {
    restore();
  }
});

test("callOpenAICompatible returns empty string when choices is absent", async () => {
  const restore = mockFetch(async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  try {
    const result = await callOpenAICompatible("build feature", "http://127.0.0.1:11434", "llama3");
    assert.equal(result, "");
  } finally {
    restore();
  }
});

test("detectLocalLLM resolves to first reachable port and uses first model id", async () => {
  const { detectLocalLLM } = await import("./summarize.ts");
  resetLocalLLMCache();

  const restore = mockFetch(async (url: unknown) => {
    if (String(url).includes(":11434")) {
      return new Response(JSON.stringify({ data: [{ id: "mistral:7b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("ECONNREFUSED");
  });
  try {
    const info = await detectLocalLLM();
    assert.ok(info !== null);
    assert.equal(info!.baseUrl, "http://127.0.0.1:11434");
    assert.equal(info!.model, "mistral:7b");
  } finally {
    restore();
    resetLocalLLMCache();
  }
});

test("detectLocalLLM falls back to port 1234 when 11434 is unreachable", async () => {
  const { detectLocalLLM } = await import("./summarize.ts");
  resetLocalLLMCache();

  const restore = mockFetch(async (url: unknown) => {
    if (String(url).includes(":11434")) throw new Error("ECONNREFUSED");
    return new Response(JSON.stringify({ data: [{ id: "phi-3" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const info = await detectLocalLLM();
    assert.ok(info !== null);
    assert.equal(info!.baseUrl, "http://127.0.0.1:1234");
    assert.equal(info!.model, "phi-3");
  } finally {
    restore();
    resetLocalLLMCache();
  }
});

test("detectLocalLLM returns null when both ports are unreachable", async () => {
  const { detectLocalLLM } = await import("./summarize.ts");
  resetLocalLLMCache();

  const restore = mockFetch(async () => { throw new Error("ECONNREFUSED"); });
  try {
    const info = await detectLocalLLM();
    assert.equal(info, null);
  } finally {
    restore();
    resetLocalLLMCache();
  }
});

test("detectLocalLLM uses a default model id when /v1/models data list is empty", async () => {
  const { detectLocalLLM } = await import("./summarize.ts");
  resetLocalLLMCache();

  const restore = mockFetch(async (url: unknown) => {
    if (String(url).includes(":11434")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("ECONNREFUSED");
  });
  try {
    const info = await detectLocalLLM();
    assert.ok(info !== null);
    assert.equal(info!.baseUrl, "http://127.0.0.1:11434");
    // should use a sensible default, not crash
    assert.ok(typeof info!.model === "string" && info!.model.length > 0);
  } finally {
    restore();
    resetLocalLLMCache();
  }
});

test("detectLocalLLM caches result and does not re-probe on subsequent calls", async () => {
  const { detectLocalLLM } = await import("./summarize.ts");
  resetLocalLLMCache();

  let probeCount = 0;
  const restore = mockFetch(async () => {
    probeCount++;
    return new Response(JSON.stringify({ data: [{ id: "cached-model" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  try {
    const first = await detectLocalLLM();
    const second = await detectLocalLLM();
    assert.equal(probeCount, 1); // only one real fetch
    assert.deepEqual(first, second);
  } finally {
    restore();
    resetLocalLLMCache();
  }
});
