/**
 * formatDuration — render a duration in milliseconds as a human-readable
 * string for the Lens side panel + retry cluster badges + iteration
 * scrubber.
 *
 * Pure function. No state. Layer 1 / Tier C / Lens v0.1.
 *
 * Format rules (tuned for "scanning a debug panel" not "scientific"):
 *   0–999 ms        → '0ms', '999ms'
 *   1–9.9 s          → '1.0s', '9.9s'   (one decimal place)
 *   10–59 s          → '12s', '59s'      (whole seconds)
 *   1m–59m 59s       → '1m 5s', '12m 0s' (zero seconds preserved for align)
 *   1h+              → '1h 3m', '4h 17m' (seconds dropped at this scale)
 *
 * Negative inputs are clamped to 0. NaN / Infinity return '—' (em dash
 * — the "no data" glyph used elsewhere in the panel).
 */

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 0) return '0ms';

  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;

  // Round to whole seconds first so 59,500ms cascades naturally to
  // 1m 0s (not '60s'), and 3,599,500ms cascades to 1h 0m (not '60m 0s').
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remSeconds = totalSeconds - totalMinutes * 60;
  if (totalMinutes < 60) return `${totalMinutes}m ${remSeconds}s`;

  const hours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes - hours * 60;
  return `${hours}h ${remMinutes}m`;
}
