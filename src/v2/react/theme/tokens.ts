/**
 * Lens theme tokens — consumers override via CSS variables.
 *
 * Two-tier contract:
 *   1. `--fp-*` shared design tokens (set by the consumer's app).
 *      Same names as `footprint-explainable-ui` so a single token sheet
 *      themes both libraries.
 *   2. `--lens-*` lens-specific overrides for things `--fp-*` doesn't
 *      cover (edge colors per kind, source-of-injection chips, etc.).
 *
 * Resolution order (highest priority first):
 *   --lens-X  →  --fp-X  →  hardcoded fallback
 *
 * Consumer integration (in your app's root CSS or theme provider):
 *
 *   :root {
 *     --fp-bg-primary:   #0f172a;
 *     --fp-bg-secondary: #1e293b;
 *     --fp-bg-tertiary:  #334155;
 *     --fp-text-primary: #f8fafc;
 *     --fp-text-secondary: #94a3b8;
 *     --fp-text-muted:   #64748b;
 *     --fp-border:       #334155;
 *     --fp-color-primary: #6366f1;
 *   }
 *
 * Then Lens picks them up automatically — no `theme=` prop needed.
 *
 * To override only Lens (not your other UI), use `--lens-*` instead.
 */

/** Raw fallback colors — used when no `--fp-*` or `--lens-*` is defined. */
export const RAW_DEFAULTS = {
  // Surfaces
  bgPrimary: '#0f172a',
  bgSecondary: '#1e293b',
  bgTertiary: '#334155',
  bgElevated: '#1e293b',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  // Border
  border: '#334155',

  // Accent / state
  primary: '#6366f1',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',

  // Edge kinds (control-flow graph)
  edgeUser: '#0284c7',
  edgeTool: '#059669',
  edgeDecision: '#db2777',

  // Injection-source chips
  srcRag: '#0284c7',
  srcSkill: '#7c3aed',
  srcMemory: '#ca8a04',
  srcInstruction: '#db2777',
  srcUser: '#059669',
  srcTool: '#0891b2',
  srcDefault: '#64748b',

  // Typography
  fontSans: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontMono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
} as const;

/**
 * `var()` chain factory: prefer `--lens-X`, then `--fp-X`, then hardcoded default.
 *
 *   v('bg-primary', RAW_DEFAULTS.bgPrimary)
 *     → 'var(--lens-bg-primary, var(--fp-bg-primary, #0f172a))'
 *
 * Use the returned string as a CSS value: `style={{ background: t.bgPrimary }}`.
 */
function v(name: string, fallback: string): string {
  return `var(--lens-${name}, var(--fp-${name}, ${fallback}))`;
}

/**
 * Token reference — every Lens component imports `T` (or destructures from it).
 * Each property is a CSS string ready to drop into `style={{ ... }}`.
 *
 * Adding a new token: add a key here AND extend `RAW_DEFAULTS` above.
 * Consumers can override by setting either `--lens-<key>` or `--fp-<key>` on
 * a parent container — Lens picks it up automatically because every
 * reference goes through the var() chain.
 */
export const T = {
  // Surfaces
  bgPrimary: v('bg-primary', RAW_DEFAULTS.bgPrimary),
  bgSecondary: v('bg-secondary', RAW_DEFAULTS.bgSecondary),
  bgTertiary: v('bg-tertiary', RAW_DEFAULTS.bgTertiary),
  bgElevated: v('bg-elevated', RAW_DEFAULTS.bgElevated),

  // Text
  textPrimary: v('text-primary', RAW_DEFAULTS.textPrimary),
  textSecondary: v('text-secondary', RAW_DEFAULTS.textSecondary),
  textMuted: v('text-muted', RAW_DEFAULTS.textMuted),

  // Border
  border: v('border', RAW_DEFAULTS.border),

  // Accent / state
  primary: v('color-primary', RAW_DEFAULTS.primary),
  success: v('color-success', RAW_DEFAULTS.success),
  error: v('color-error', RAW_DEFAULTS.error),
  warning: v('color-warning', RAW_DEFAULTS.warning),

  // Edge kinds (no `--fp-` cousin — lens-only)
  edgeUser: `var(--lens-edge-user, ${RAW_DEFAULTS.edgeUser})`,
  edgeTool: `var(--lens-edge-tool, ${RAW_DEFAULTS.edgeTool})`,
  edgeDecision: `var(--lens-edge-decision, ${RAW_DEFAULTS.edgeDecision})`,
  edgeDefault: `var(--lens-edge-default, ${RAW_DEFAULTS.textMuted})`,

  // Injection-source chips (lens-only)
  srcRag: `var(--lens-src-rag, ${RAW_DEFAULTS.srcRag})`,
  srcSkill: `var(--lens-src-skill, ${RAW_DEFAULTS.srcSkill})`,
  srcMemory: `var(--lens-src-memory, ${RAW_DEFAULTS.srcMemory})`,
  srcInstruction: `var(--lens-src-instruction, ${RAW_DEFAULTS.srcInstruction})`,
  srcUser: `var(--lens-src-user, ${RAW_DEFAULTS.srcUser})`,
  srcTool: `var(--lens-src-tool, ${RAW_DEFAULTS.srcTool})`,
  srcDefault: `var(--lens-src-default, ${RAW_DEFAULTS.srcDefault})`,

  // Typography
  fontSans: v('font-sans', RAW_DEFAULTS.fontSans),
  fontMono: v('font-mono', RAW_DEFAULTS.fontMono),
} as const;

export type LensTokens = typeof T;
