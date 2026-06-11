import { readSecrets } from "./secrets.ts";
import { readSettings } from "./store.ts";

/**
 * Turn a raw coding prompt into a short "Now Building" feature label for the
 * overlay. Supports three providers: local OpenAI-compatible LLM (Ollama/LM
 * Studio), Gemini, or a pure local template fallback — picked by the
 * `summarizer.provider` field in settings.json (default: "auto").
 *
 * Security: the Gemini key lives ONLY in ~/.vibelog/secrets.json (chmod 600),
 * is read by this process and never exported into the streamed shell, never
 * logged, and never reaches LiveState / the overlay. Local LLM calls go to
 * localhost only. On error we log err.message only — never the prompt, headers,
 * or key.
 */

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const TIMEOUT_MS = 2500;
const DETECT_TIMEOUT_MS = 1000;

const LOCAL_PORTS = [11434, 1234] as const;

const SYSTEM_INSTRUCTION =
  "You convert a developer's coding prompt into a single short present-tense " +
  "feature label for a live 'now building' stream overlay. Reply with ONLY the " +
  "label: max 8 words, no quotes, no trailing punctuation, no code, no file " +
  "paths, no secrets. Example input: 'can you add discord oauth to the login " +
  "page' -> 'Adding Discord OAuth to login'.";

/** Strip a model reply down to a clean label: no quotes, no trailing punctuation, capped. */
export function sanitizeLabel(raw: string): string {
  let s = raw.replace(/[`"']/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/[.;:,\s]+$/, "");
  const words = s.split(" ").filter(Boolean).slice(0, 9);
  s = words.join(" ");
  if (s) s = s[0]!.toUpperCase() + s.slice(1);
  return s.slice(0, 90);
}

/**
 * Pure local fallback: derive a feature-ish label from the prompt without any
 * network. Drops code blocks, takes the first meaningful line, strips polite
 * filler, and title-cases. Deterministic and unit-testable.
 */
export function templateSummary(prompt: string): string {
  const noCode = prompt
    .replace(/```[\s\S]*?```/g, " ") // fenced blocks
    .replace(/`[^`]*`/g, " "); // inline code
  const line = noCode
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
  const filler = /^(hey|ok|okay|so|now|just|please|pls|can you|could you|would you|i want you to|i'd like you to|i would like you to|let's|lets|go ahead and|i need you to|help me|we should|we need to|i want to|i'd like to)\s+/i;
  let stripped = line;
  for (let i = 0; i < 4 && filler.test(stripped); i++) stripped = stripped.replace(filler, "");
  const label = sanitizeLabel(stripped || line);
  return label || "Vibe coding";
}

async function callGemini(prompt: string, key: string, model: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ parts: [{ text: prompt.slice(0, 4000) }] }],
          generationConfig: { maxOutputTokens: 32, temperature: 0.4 },
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) throw new Error(`gemini http ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return String(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call an OpenAI-compatible /v1/chat/completions endpoint (covers Ollama and
 * LM Studio). No API key header — local servers don't need one. Uses the same
 * SYSTEM_INSTRUCTION and TIMEOUT_MS as the Gemini path.
 */
export async function callOpenAICompatible(
  prompt: string,
  baseUrl: string,
  model: string,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt.slice(0, 4000) },
        ],
        max_tokens: 32,
        temperature: 0.4,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`local-llm http ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return String(data.choices?.[0]?.message?.content ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

/** Cached result of the last detectLocalLLM() probe. */
type LocalLLMInfo = { baseUrl: string; model: string };
let _localLLMCache: LocalLLMInfo | null | undefined = undefined;

/** Reset the detection cache (used in tests). */
export function resetLocalLLMCache(): void {
  _localLLMCache = undefined;
}

/**
 * Probe the two fixed localhost ports (11434 for Ollama, 1234 for LM Studio)
 * with a short timeout. Returns the first reachable server's baseUrl + the
 * first model from its /v1/models list (or a sensible default). Caches the
 * result so we don't re-probe on every summarize() call. Never throws.
 *
 * Only probes localhost — never arbitrary remote URLs.
 */
export async function detectLocalLLM(): Promise<LocalLLMInfo | null> {
  if (_localLLMCache !== undefined) return _localLLMCache;

  for (const port of LOCAL_PORTS) {
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), DETECT_TIMEOUT_MS);
      let data: { data?: { id?: string }[] } = {};
      try {
        const res = await fetch(`${baseUrl}/v1/models`, { signal: ctrl.signal });
        if (res.ok) {
          data = (await res.json()) as { data?: { id?: string }[] };
        }
      } finally {
        clearTimeout(timer);
      }
      const model = data.data?.[0]?.id ?? (port === 11434 ? "llama3" : "local-model");
      _localLLMCache = { baseUrl, model };
      return _localLLMCache;
    } catch {
      // port not reachable — try the next one
    }
  }

  _localLLMCache = null;
  return null;
}

export type Summary = { text: string; source: "gemini" | "local" | "template" };

/** Best-effort feature label for a prompt. Never throws. */
export async function summarize(prompt: string): Promise<Summary> {
  const fallback = templateSummary(prompt);

  // Read non-secret config from settings.json
  const settings = await readSettings();
  const summarizerCfg = settings?.summarizer;
  const provider = summarizerCfg?.provider ?? "auto";

  if (provider === "template") {
    return { text: fallback, source: "template" };
  }

  if (provider === "local") {
    // Use explicit config if provided, else auto-detect localhost
    let info: LocalLLMInfo | null = null;
    if (summarizerCfg?.baseUrl && summarizerCfg?.model) {
      info = { baseUrl: summarizerCfg.baseUrl, model: summarizerCfg.model };
    } else if (summarizerCfg?.baseUrl) {
      info = { baseUrl: summarizerCfg.baseUrl, model: summarizerCfg.model ?? "local-model" };
    } else {
      info = await detectLocalLLM();
    }
    if (info) {
      try {
        const out = sanitizeLabel(await callOpenAICompatible(prompt, info.baseUrl, info.model));
        return out ? { text: out, source: "local" } : { text: fallback, source: "template" };
      } catch (err) {
        console.error("[vibelog] summarizer fell back to template:", (err as Error).message);
        return { text: fallback, source: "template" };
      }
    }
    return { text: fallback, source: "template" };
  }

  if (provider === "gemini") {
    const { geminiApiKey, geminiModel } = await readSecrets();
    if (!geminiApiKey) return { text: fallback, source: "template" };
    try {
      const out = sanitizeLabel(
        await callGemini(prompt, geminiApiKey, geminiModel || DEFAULT_GEMINI_MODEL),
      );
      return out ? { text: out, source: "gemini" } : { text: fallback, source: "template" };
    } catch (err) {
      console.error("[vibelog] summarizer fell back to template:", (err as Error).message);
      return { text: fallback, source: "template" };
    }
  }

  // provider === "auto": local → gemini → template
  const localInfo = await detectLocalLLM();
  if (localInfo) {
    try {
      const out = sanitizeLabel(
        await callOpenAICompatible(prompt, localInfo.baseUrl, localInfo.model),
      );
      return out ? { text: out, source: "local" } : { text: fallback, source: "template" };
    } catch (err) {
      console.error("[vibelog] summarizer fell back to template:", (err as Error).message);
      // fall through to gemini
    }
  }

  const { geminiApiKey, geminiModel } = await readSecrets();
  if (geminiApiKey) {
    try {
      const out = sanitizeLabel(
        await callGemini(prompt, geminiApiKey, geminiModel || DEFAULT_GEMINI_MODEL),
      );
      return out ? { text: out, source: "gemini" } : { text: fallback, source: "template" };
    } catch (err) {
      console.error("[vibelog] summarizer fell back to template:", (err as Error).message);
    }
  }

  return { text: fallback, source: "template" };
}
