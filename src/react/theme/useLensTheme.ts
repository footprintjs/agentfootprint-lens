/**
 * useLensTheme — single source of truth for Lens colors + sizing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Theme pass-through contract (IMPORTANT for consumers):
 *
 * Lens does NOT invent its own theme system. It reads tokens from the
 * FootprintTheme context already defined in `footprint-explainable-ui`.
 * A consumer app that wraps its tree in:
 *
 *     import { FootprintTheme, coolDark, coolLight } from 'footprint-explainable-ui';
 *     <FootprintTheme tokens={theme === 'light' ? coolLight : coolDark}>
 *       <AgentLens runtimeSnapshot={snap} />
 *     </FootprintTheme>
 *
 * …gets both Lens AND the drill-down explainable-ui drawer themed from the
 * same token bag. No separate `theme` prop, no duplicate palette, no
 * drift between the two views when the user flips light/dark.
 *
 * If no FootprintTheme provider is mounted, Lens falls back to cool-dark
 * defaults — the same defaults explainable-ui uses, so it looks correct
 * out of the box without configuration.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useFootprintTheme, coolDark } from "footprint-explainable-ui";
import type { ThemeTokens } from "footprint-explainable-ui";

/**
 * The resolved color palette + sizing tokens Lens renders against.
 * Always defined — callers never need to null-check.
 */
export interface LensTheme {
  readonly bg: string;
  readonly bgElev: string;
  readonly bgHover: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textSubtle: string;
  readonly accent: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly fontSans: string;
  readonly fontMono: string;
  readonly radius: string;
}

/**
 * Read tokens from FootprintTheme context (if present) and map them
 * into Lens's semantic palette. Missing tokens fall back to coolDark.
 */
export function useLensTheme(): LensTheme {
  const ctx = useFootprintTheme();
  return resolve(ctx);
}

/** Pure mapping — exported for unit tests + non-hook call sites. */
export function resolve(tokens: ThemeTokens | undefined): LensTheme {
  const t = tokens ?? {};
  const c = t.colors ?? coolDark.colors ?? {};
  const fallback = coolDark.colors ?? {};
  return {
    bg: c.bgPrimary ?? fallback.bgPrimary ?? "#0f172a",
    bgElev: c.bgSecondary ?? fallback.bgSecondary ?? "#1e293b",
    bgHover: c.bgTertiary ?? fallback.bgTertiary ?? "#334155",
    border: c.border ?? fallback.border ?? "#334155",
    borderStrong: c.bgTertiary ?? fallback.bgTertiary ?? "#334155",
    text: c.textPrimary ?? fallback.textPrimary ?? "#f8fafc",
    textMuted: c.textSecondary ?? fallback.textSecondary ?? "#94a3b8",
    textSubtle: c.textMuted ?? fallback.textMuted ?? "#64748b",
    accent: c.primary ?? fallback.primary ?? "#6366f1",
    success: c.success ?? fallback.success ?? "#22c55e",
    warning: c.warning ?? fallback.warning ?? "#f59e0b",
    error: c.error ?? fallback.error ?? "#ef4444",
    fontSans: t.fontFamily?.sans ?? coolDark.fontFamily?.sans ?? "system-ui, sans-serif",
    fontMono: t.fontFamily?.mono ?? coolDark.fontFamily?.mono ?? "ui-monospace, monospace",
    radius: t.radius ?? coolDark.radius ?? "8px",
  };
}
