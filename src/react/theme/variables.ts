import type React from 'react';
import { tokensToCSSVars, coolLight, coolDark } from 'footprint-explainable-ui';
import { MODE_PALETTES } from './tokens.js';

/**
 * The Lens chart's three-colour theme (agentfootprint level).
 *
 * `mode` is the COARSE switch: it applies eui's full light/dark preset as
 * `--fp-*` variables at the Lens root — so the eui-rendered nodes (stages, slot
 * pills, subflow boxes) follow dark/light from this one field, in ALL THREE
 * views, with no hand-setting of `--fp-*`. It also fills in the tokens eui's
 * presets have no cousin for: the elevated surface Lens's own panels (summary,
 * transport, moments rail, detail) sit on, the edge colours, and the
 * injection-source chips — see `MODE_PALETTES`. Every one of those lands in the
 * `--fp-*` tier, so the resolution order is unchanged and a consumer's own
 * `--lens-*` on any ancestor still wins.
 *
 * `ground` is the base (unvisited) colour, `visited` and `current` the executed
 * + cursor colours, layered on top. All optional.
 */
export interface LensTheme {
  mode?: 'dark' | 'light';
  /** Base / unvisited nodes. */
  ground?: string;
  /** Executed / done nodes. */
  visited?: string;
  /** The node at the current cursor ("now"). */
  current?: string;
}

export function lensThemeVars(theme?: LensTheme): React.CSSProperties {
  if (!theme) return {};
  const base = theme.mode ? {
    ...(tokensToCSSVars(theme.mode === 'light' ? coolLight : coolDark) as React.CSSProperties),
    ...MODE_PALETTES[theme.mode],
  } : {};
  return {
    ...base,
    ...(theme.visited !== undefined && { ['--fp-node-visited' as string]: theme.visited }),
    ...(theme.current !== undefined && { ['--fp-node-cursor' as string]: theme.current }),
  } as React.CSSProperties;
}
