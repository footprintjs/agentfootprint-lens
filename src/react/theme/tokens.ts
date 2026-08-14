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

  // The active GROUP on the grouped ruler — the one accent every member of the
  // group lights with, the outline drawn around them, and its name chip. Its
  // own token (not `primary`) because a consumer will want to tune "the place
  // I'm standing in" without moving every other accent in the Lens.
  groupAccent: '#6366f1',

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

  // Group mode (see RAW_DEFAULTS.groupAccent). eui ships no `--fp-group-accent`,
  // so the middle tier is free for `theme.mode` to stamp a light variant into
  // without ever outranking a consumer's `--lens-group-accent`.
  groupAccent: v('group-accent', RAW_DEFAULTS.groupAccent),

  // Edge kinds — lens-only NAMES, but the same three-tier chain as the rest.
  // eui ships no `--fp-edge-*`, so the middle tier is free for `theme.mode` to
  // stamp a light variant into (see MODE_PALETTES) without ever outranking a
  // consumer's `--lens-edge-*`.
  edgeUser: v('edge-user', RAW_DEFAULTS.edgeUser),
  edgeTool: v('edge-tool', RAW_DEFAULTS.edgeTool),
  edgeDecision: v('edge-decision', RAW_DEFAULTS.edgeDecision),
  edgeDefault: v('edge-default', RAW_DEFAULTS.textMuted),

  // Injection-source chips — same three-tier chain, same reason.
  srcRag: v('src-rag', RAW_DEFAULTS.srcRag),
  srcSkill: v('src-skill', RAW_DEFAULTS.srcSkill),
  srcMemory: v('src-memory', RAW_DEFAULTS.srcMemory),
  srcInstruction: v('src-instruction', RAW_DEFAULTS.srcInstruction),
  srcUser: v('src-user', RAW_DEFAULTS.srcUser),
  srcTool: v('src-tool', RAW_DEFAULTS.srcTool),
  srcDefault: v('src-default', RAW_DEFAULTS.srcDefault),

  // Typography
  fontSans: v('font-sans', RAW_DEFAULTS.fontSans),
  fontMono: v('font-mono', RAW_DEFAULTS.fontMono),
} as const;

export type LensTokens = typeof T;

/**
 * One agent = one swatch colour, by index. The strip reads
 * `--lens-agent-color-N`; these are what it paints when nobody defined them.
 *
 * Eight hues that stay distinguishable on BOTH a dark and a light surface
 * (mid-tone, similar luminance) — the strip is the only place a run's agents
 * are told apart at a glance, and "the consumer's design tokens own the
 * palette" was, in practice, "the swatches paint nothing".
 */
export const AGENT_COLORS = [
  '#6366f1', // indigo
  '#059669', // emerald
  '#db2777', // pink
  '#d97706', // amber
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#dc2626', // red
  '#65a30d', // lime
] as const;

/** The swatch colour for one agent row: consumer override, else the palette. */
export function agentColor(index: number): string {
  const fallback = AGENT_COLORS[index % AGENT_COLORS.length] ?? AGENT_COLORS[0];
  return `var(--lens-agent-color-${index}, ${fallback})`;
}

/**
 * The lens-only palettes, per mode — what `<Lens theme={{ mode }}>` stamps into
 * the `--fp-*` tier.
 *
 * Edge colours and injection-source chips have no eui cousin, so a preset can
 * never reach them: `mode: 'light'` re-themed everything eui draws and left
 * these at their dark-tuned defaults, on a white background. These are the same
 * hues, darkened for light surfaces (dark mode keeps `RAW_DEFAULTS` exactly, so
 * nothing moves for existing users).
 *
 * They go into `--fp-*`, never `--lens-*`: a consumer who set `--lens-edge-tool`
 * on a parent must still win.
 */
export const MODE_PALETTES: Record<'dark' | 'light', Readonly<Record<string, string>>> = {
  dark: {
    '--fp-bg-elevated': RAW_DEFAULTS.bgElevated,
    '--fp-edge-user': RAW_DEFAULTS.edgeUser,
    '--fp-edge-tool': RAW_DEFAULTS.edgeTool,
    '--fp-edge-decision': RAW_DEFAULTS.edgeDecision,
    '--fp-edge-default': RAW_DEFAULTS.textMuted,
    '--fp-src-rag': RAW_DEFAULTS.srcRag,
    '--fp-src-skill': RAW_DEFAULTS.srcSkill,
    '--fp-src-memory': RAW_DEFAULTS.srcMemory,
    '--fp-src-instruction': RAW_DEFAULTS.srcInstruction,
    '--fp-src-user': RAW_DEFAULTS.srcUser,
    '--fp-src-tool': RAW_DEFAULTS.srcTool,
    '--fp-src-default': RAW_DEFAULTS.srcDefault,
    '--fp-group-accent': RAW_DEFAULTS.groupAccent,
  },
  light: {
    // The card surface Lens's own panels sit on. eui's presets stop at
    // bg-primary/secondary/tertiary, so this is the one surface token the mode
    // switch has to supply itself.
    '--fp-bg-elevated': '#f9fafb',
    '--fp-edge-user': '#0369a1',
    '--fp-edge-tool': '#047857',
    '--fp-edge-decision': '#be185d',
    '--fp-edge-default': '#71717a',
    '--fp-src-rag': '#0369a1',
    '--fp-src-skill': '#6d28d9',
    '--fp-src-memory': '#a16207',
    '--fp-src-instruction': '#be185d',
    '--fp-src-user': '#047857',
    '--fp-src-tool': '#0e7490',
    '--fp-src-default': '#52525b',
    // A touch deeper on a white ground: the group's wash is a low-percentage
    // mix of this, and the dark-tuned indigo washes out to nothing on paper.
    '--fp-group-accent': '#4f46e5',
  },
};
