/**
 * Claude API list prices, used to estimate the dollar cost of local Claude Code
 * usage from transcript token counts. Offline on purpose: no price feed, no
 * network. Update this table when Anthropic changes prices or ships a model.
 *
 * Source: Anthropic first-party API pricing, checked 2026-11-09.
 * Cache writes cost 1.25x input (5-minute TTL) or 2x input (1-hour TTL). Cache
 * reads are 0.1x input except where the table says otherwise.
 *
 * This is an estimate: Claude Code subscribers do not pay per token, and
 * long-context surcharges (prompts over 200K on some older models, over 100K on
 * Haiku 5.5) are not modelled.
 */

/** USD per million tokens. */
export type Price = { input: number; output: number; cacheRead?: number };

/**
 * Model id prefix -> price. The longest matching prefix wins, so a specific
 * version (claude-opus-4-1) overrides its family (claude-opus-4).
 */
export const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-3-7-sonnet": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
};

const PREFIXES = Object.keys(PRICES).sort((a, b) => b.length - a.length);

/**
 * Normalise a model id as it appears in transcripts or provider consoles:
 * drop a provider prefix (anthropic.), a Vertex @version, a context tag
 * like [1m], and a trailing -v1:0 Bedrock suffix.
 */
export function normalizeModel(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^.*?anthropic\./, "")
    .replace(/\[[^\]]*\]$/, "")
    .replace(/@.*$/, "")
    .replace(/-v\d+(:\d+)?$/, "");
}

/** Price for a model id, or null when it is unknown (counted as $0). */
export function priceFor(model: string | undefined): Price | null {
  if (!model) return null;
  const id = normalizeModel(model);
  for (const p of PREFIXES) {
    if (id === p || id.startsWith(`${p}-`)) return PRICES[p]!;
  }
  return null;
}

export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

/** Estimated USD for one assistant message's usage. */
export function costOf(model: string | undefined, u: TokenUsage): number {
  const p = priceFor(model);
  if (!p) return 0;
  const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const write = n(u.cache_creation_input_tokens);
  // Split cache writes by TTL when the transcript says; otherwise assume 5 minutes.
  const write1h = Math.min(write, n(u.cache_creation?.ephemeral_1h_input_tokens));
  const write5m = write - write1h;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  return (
    (n(u.input_tokens) * p.input +
      n(u.output_tokens) * p.output +
      write5m * p.input * 1.25 +
      write1h * p.input * 2 +
      n(u.cache_read_input_tokens) * cacheRead) /
    1_000_000
  );
}
