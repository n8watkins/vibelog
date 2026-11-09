"use client";

import { useEffect, useState } from "react";

const fmt = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

/**
 * The monitor's running timecode. Starts where the captured session was
 * (2 min 34 s in) and ticks once a second; frozen for reduced motion.
 */
export function Timecode({ start = 154 }: { start?: number }) {
  const [t, setT] = useState(start);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums" aria-hidden="true">
      {fmt(t)}
    </span>
  );
}
