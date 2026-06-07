/**
 * The safety net. Every user-supplied string written to LiveState passes through
 * redact() before it can reach the overlay / a public tunnel. The primary defense
 * is that the agent only emits text the user typed + numeric stats — this catches
 * the case where the user pastes a secret into a `vibe mark` message by accident.
 *
 * See V0_SPEC.md §6.
 */

export const REDACTION_PLACEHOLDER = "[REDACTED]";

// Order matters: more specific token shapes before the generic key=value catch.
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /sk-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style
  /ghp_[A-Za-z0-9]{20,}/g, // GitHub personal access token
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g, // Google / Gemini API key
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?token)\b\s*[=:]\s*\S+/gi,
];

export function redact(input: string): string {
  let out = input;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return out;
}

/** True if redaction would change the string (i.e. a secret was present). */
export function containsSecret(input: string): boolean {
  return redact(input) !== input;
}
