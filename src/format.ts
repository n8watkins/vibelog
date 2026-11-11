/**
 * Compact token counts for terminal output: 999, 12.3K, 301.6M, 4.6B. A value
 * that would round up to 1000 of a unit moves to the next unit instead.
 */
export function formatTokens(n: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i]!;
    if (n < size) continue;
    const shown = (n / size).toFixed(1);
    if (Number(shown) >= 1000 && i > 0) return (n / units[i - 1]![0]).toFixed(1) + units[i - 1]![1];
    return shown + suffix;
  }
  return String(n);
}
