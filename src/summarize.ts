import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Turn a raw coding prompt into a short "Now Building" feature label for the
 * overlay. Default path calls Gemini 3.1 Flash-Lite; falls back to a pure local
 * template when no key is configured, the call errors, or it times out — so the
 * overlay never stalls and zero-config still works (see docs/INFRA_PLAN.md §1).
 *
 * Security: the key lives ONLY in ~/.vibelog/secrets.json (chmod 600), is read
 * by this process and never exported into the streamed shell, never logged, and
 * never reaches LiveState / the overlay. On error we log err.message only —
 * never the prompt, headers, or key.
 */

const SECRETS_FILE = path.join(os.homedir(), ".vibelog", "secrets.json");
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const TIMEOUT_MS = 2500;

const SYSTEM_INSTRUCTION =
  "You convert a developer's coding prompt into a single short present-tense " +
  "feature label for a live 'now building' stream overlay. Reply with ONLY the " +
  "label: max 8 words, no quotes, no trailing punctuation, no code, no file " +
  "paths, no secrets. Example input: 'can you add discord oauth to the login " +
  "page' -> 'Adding Discord OAuth to login'.";

type Secrets = { geminiApiKey?: string; geminiModel?: string };

let secretsCache: { at: number; data: Secrets } | null = null;
async function loadSecrets(): Promise<Secrets> {
  if (secretsCache && Date.now() - secretsCache.at < 30_000) return secretsCache.data;
  let data: Secrets = {};
  try {
    data = JSON.parse(await readFile(SECRETS_FILE, "utf8")) as Secrets;
  } catch {
    // no secrets file / unreadable — template-only mode
  }
  secretsCache = { at: Date.now(), data };
  return data;
}

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

export type Summary = { text: string; source: "gemini" | "template" };

/** Best-effort feature label for a prompt. Never throws. */
export async function summarize(prompt: string): Promise<Summary> {
  const fallback = templateSummary(prompt);
  const { geminiApiKey, geminiModel } = await loadSecrets();
  if (!geminiApiKey) return { text: fallback, source: "template" };
  try {
    const out = sanitizeLabel(await callGemini(prompt, geminiApiKey, geminiModel || DEFAULT_MODEL));
    return out ? { text: out, source: "gemini" } : { text: fallback, source: "template" };
  } catch (err) {
    // err.message only — never the prompt, key, or headers.
    console.error("[vibelog] summarizer fell back to template:", (err as Error).message);
    return { text: fallback, source: "template" };
  }
}
