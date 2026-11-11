"use client";

import { useState } from "react";

/** A shell snippet with a copy button. Lines starting with "#" render as comments. */
export function CopyCommand({ lines, label }: { lines: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  const text = lines.filter((l) => !l.startsWith("#")).join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context or permissions): the text stays selectable.
    }
  }

  return (
    <div className="relative min-w-0 rounded-md border border-line-2 bg-bg-2">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="slate text-dim">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="slate min-h-8 rounded px-2 text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`Copy ${label}`}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[13px] leading-6">
        {lines.map((l) =>
          l.startsWith("#") ? (
            <span key={l} className="block text-dim">
              {l}
            </span>
          ) : (
            <span key={l} className="block">
              <span aria-hidden="true" className="text-dim select-none">
                ${" "}
              </span>
              {l}
            </span>
          ),
        )}
      </pre>
    </div>
  );
}
