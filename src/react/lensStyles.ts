/**
 * The stylesheet Lens ships for its own class-styled components — and injects
 * itself, so there is nothing for a consumer to import and nothing to forget.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Lens paints two ways. Most components use the inline `T` token chain
 * (`style={{ background: T.bgElevated }}`). Eight of them style themselves with
 * `lens-*` class names instead — `<Replay>`, `<AgentLegendStrip>`,
 * `<BreadcrumbHoverPreview>`, `<CompareBranchesPanel>`, `<CrossSubflowChip>`,
 * `<IterationScrubber>`, `<RuntimeIdInspector>`, `<TokenCostBadge>` (plus
 * `<AnimatedEdge>`'s dash animation). The package shipped no CSS for any of
 * them, so every one rendered unstyled — including `<Replay>`, an entry point.
 *
 * THE RULES HERE
 * ──────────────
 *   1. Every colour goes through the SAME `var()` chain the inline tokens use
 *      (`T`), so one token sheet themes both halves and `theme={{ mode }}`
 *      reaches these components too.
 *   2. Injection is idempotent and marked, and happens on first render of a
 *      component that needs it — not at module load, so importing the library
 *      in a Node/SSR process touches no DOM.
 *   3. `LENS_STYLESHEET` is exported as text: an SSR renderer or a
 *      strict-CSP app can put it in its own `<style>` and skip the injection.
 */

import { T } from './theme/index.js';

/** Marker attribute on the injected `<style>` — bump when the sheet changes. */
const STYLE_MARKER = 'data-lens-styles';
const STYLE_VERSION = 'v5';

/**
 * The whole Lens stylesheet, as text. Exported so a server renderer can inline
 * it (`<style>{LENS_STYLESHEET}</style>`) instead of relying on the injection.
 */
export const LENS_STYLESHEET = `
/* The streaming caret's blink, and the in-flight edge's dash march. */
@keyframes lens-blink { 50% { opacity: 0; } }
@keyframes lens-edge-dash { to { stroke-dashoffset: -16; } }

.lens-animated-edge { stroke-linecap: round; }
.lens-animated-edge--inflight {
  stroke-dasharray: 6 4;
  animation: lens-edge-dash 0.6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .lens-animated-edge--inflight { animation: none; }
}

/* ── Agent legend strip ───────────────────────────────────────────── */
.lens-agent-legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  font-family: ${T.fontSans};
}
.lens-agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: ${T.textPrimary};
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.lens-agent-row:hover { background: ${T.bgTertiary}; }
.lens-agent-row--active {
  background: ${T.bgElevated};
  border-color: ${T.primary};
}
.lens-agent-swatch {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.lens-agent-name { font-weight: 600; }
.lens-agent-role,
.lens-agent-model {
  color: ${T.textMuted};
  font-size: 11px;
}
.lens-agent-model { font-family: ${T.fontMono}; }

/* ── Replay (offline chart) ───────────────────────────────────────── */
.lens-replay {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: ${T.bgPrimary};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
}
.lens-replay--no-structure {
  padding: 24px;
  color: ${T.textMuted};
  font-size: 12px;
  line-height: 1.6;
}
.lens-replay__warning {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-bottom: 1px solid ${T.border};
  background: ${T.bgElevated};
  color: ${T.warning};
  font-size: 12px;
}
.lens-replay > :not(.lens-replay__warning) { flex: 1; min-height: 0; }

/* ── Breadcrumb hover preview ─────────────────────────────────────── */
.lens-breadcrumb-hover {
  padding: 6px 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgElevated};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
  font-size: 12px;
}
.lens-breadcrumb-hover__label { font-weight: 600; }
.lens-breadcrumb-hover__count { color: ${T.textMuted}; font-size: 11px; }

/* ── Compare branches panel ───────────────────────────────────────── */
.lens-compare-branches {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: ${T.bgElevated};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
  font-size: 12px;
}
.lens-compare-branches__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${T.textSecondary};
}
.lens-compare-branches__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}
.lens-compare-branches__column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgSecondary};
  min-width: 0;
}
.lens-compare-branches__column--pinned { border-color: ${T.primary}; }
.lens-compare-branches__column-header {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.lens-compare-branches__section { color: ${T.textSecondary}; }
.lens-compare-branches__status { font-family: ${T.fontMono}; font-size: 11px; }
.lens-compare-branches__error { color: ${T.error}; }
.lens-compare-branches__footer { color: ${T.textMuted}; font-size: 11px; }

/* ── Cross-subflow chip ───────────────────────────────────────────── */
.lens-cross-subflow-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: 1px solid ${T.border};
  border-radius: 999px;
  background: ${T.bgTertiary};
  color: ${T.textSecondary};
  font-family: ${T.fontSans};
  font-size: 11px;
}
.lens-cross-subflow-chip__label { overflow-wrap: anywhere; }

/* ── Iteration scrubber ───────────────────────────────────────────── */
.lens-iteration-scrubber {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  font-family: ${T.fontMono};
}
.lens-iteration-segment {
  min-width: 20px;
  padding: 1px 4px;
  border: 1px solid ${T.border};
  border-radius: 4px;
  background: ${T.bgSecondary};
  color: ${T.textSecondary};
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.lens-iteration-segment--past { color: ${T.textPrimary}; }
.lens-iteration-segment--current {
  border-color: ${T.primary};
  background: ${T.primary};
  color: #ffffff;
}
.lens-iteration-segment--future {
  opacity: 0.45;
  cursor: default;
}

/* ── Runtime id inspector ─────────────────────────────────────────── */
.lens-runtime-inspector {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgSecondary};
  color: ${T.textPrimary};
  font-family: ${T.fontMono};
  font-size: 11px;
}
.lens-runtime-inspector__row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  overflow-wrap: anywhere;
}
.lens-runtime-inspector__row dt { color: ${T.textMuted}; }
.lens-runtime-inspector__row dd { margin: 0; }
.lens-runtime-inspector__caveat {
  margin-top: 4px;
  color: ${T.textMuted};
  font-family: ${T.fontSans};
  font-size: 11px;
}

/* ── Token / cost badge ───────────────────────────────────────────── */
.lens-token-cost-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: ${T.fontMono};
  font-size: 11px;
  color: ${T.textSecondary};
}
.lens-token-cost-badge__tokens { color: ${T.textPrimary}; }
.lens-token-cost-badge__cost { color: ${T.success}; }

/* ── Bug report button + consent modal ────────────────────────────── */
.lens-bug-report__open {
  padding: 3px 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgSecondary};
  color: ${T.textSecondary};
  font-family: ${T.fontSans};
  font-size: 11px;
  cursor: pointer;
}
.lens-bug-report__open:hover { color: ${T.textPrimary}; border-color: ${T.primary}; }
.lens-bug-report__unsupported {
  display: inline-block;
  max-width: 46ch;
  color: ${T.textMuted};
  font-family: ${T.fontSans};
  font-size: 11px;
  line-height: 1.5;
}
.lens-bug-report__unsupported code { font-family: ${T.fontMono}; }
.lens-bug-report__overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
}
.lens-bug-report__dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(680px, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 14px 16px;
  border: 1px solid ${T.border};
  border-radius: 10px;
  background: ${T.bgElevated};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
  font-size: 12px;
  line-height: 1.5;
}
.lens-bug-report__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.lens-bug-report__header h2 { margin: 0; font-size: 14px; }
.lens-bug-report__header button {
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: ${T.textSecondary};
  font: inherit;
  cursor: pointer;
}
.lens-bug-report__header button:hover { color: ${T.textPrimary}; border-color: ${T.border}; }
.lens-bug-report__body { display: flex; flex-direction: column; gap: 12px; }
.lens-bug-report__fields { display: flex; flex-direction: column; gap: 8px; }
.lens-bug-report__fields label { display: flex; flex-direction: column; gap: 3px; }
.lens-bug-report__fields span { color: ${T.textSecondary}; font-size: 11px; }
.lens-bug-report__fields input,
.lens-bug-report__fields textarea {
  padding: 5px 7px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgSecondary};
  color: ${T.textPrimary};
  font-family: inherit;
  font-size: 12px;
  resize: vertical;
}
.lens-bug-report__fields input:focus-visible,
.lens-bug-report__fields textarea:focus-visible,
.lens-bug-report__consent input:focus-visible,
.lens-bug-report__modes button:focus-visible {
  outline: 2px solid ${T.primary};
  outline-offset: 1px;
}
.lens-bug-report__consent {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid ${T.border};
  border-radius: 8px;
  background: ${T.bgSecondary};
}
.lens-bug-report__consent legend { padding: 0 4px; color: ${T.textSecondary}; font-size: 11px; }
.lens-bug-report__consent ul { margin: 0; padding: 0; list-style: none; }
.lens-bug-report__consent li { padding: 2px 0; }
.lens-bug-report__consent label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
}
.lens-bug-report__unit-label { flex: 1; overflow-wrap: anywhere; }
.lens-bug-report__unit-meta {
  flex: none;
  color: ${T.textMuted};
  font-family: ${T.fontMono};
  font-size: 11px;
  white-space: nowrap;
}
.lens-bug-report__redacted {
  margin: 6px 0 0;
  color: ${T.warning};
  font-size: 11px;
  overflow-wrap: anywhere;
}
.lens-bug-report__caveat {
  display: block;
  margin: 4px 0 0;
  color: ${T.textMuted};
  font-size: 11px;
}
.lens-bug-report__meter {
  padding: 6px 8px;
  border: 1px solid ${T.border};
  border-radius: 8px;
  background: ${T.bgSecondary};
  font-size: 11px;
}
.lens-bug-report__meter strong { font-family: ${T.fontMono}; font-size: 12px; }
.lens-bug-report__meter[data-state="ready"] { border-color: ${T.success}; }
.lens-bug-report__meter[data-state="over"] { border-color: ${T.error}; color: ${T.error}; }
.lens-bug-report__library-hint { color: ${T.textSecondary}; }
.lens-bug-report__device {
  padding: 8px 10px;
  border: 1px solid ${T.primary};
  border-radius: 8px;
  background: ${T.bgSecondary};
}
.lens-bug-report__device p { margin: 2px 0; }
.lens-bug-report__device code { font-family: ${T.fontMono}; font-size: 14px; letter-spacing: 1px; }
.lens-bug-report__device a,
.lens-bug-report__result a { color: ${T.primary}; overflow-wrap: anywhere; }
.lens-bug-report__modes { display: flex; flex-direction: column; gap: 4px; }
.lens-bug-report__modes button {
  padding: 6px 10px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgTertiary};
  color: ${T.textPrimary};
  font: inherit;
  cursor: pointer;
}
.lens-bug-report__modes button:hover:not(:disabled) { border-color: ${T.primary}; }
.lens-bug-report__modes button:disabled { opacity: 0.5; cursor: not-allowed; }
.lens-bug-report__mode-note { margin: 0 0 6px; color: ${T.textMuted}; font-size: 11px; }
.lens-bug-report__error { margin: 0; color: ${T.error}; font-size: 12px; }
.lens-bug-report__result ul { margin: 4px 0; padding-left: 18px; color: ${T.textSecondary}; }

/* ── Render-by-ref artifacts (pane, meta card, rows table) ───────────── */
.lens-artifact__pane {
  border: 1px solid ${T.border};
  border-radius: 8px;
  padding: 8px 10px;
  background: ${T.bgSecondary};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
  font-size: 12px;
  line-height: 1.5;
}
.lens-artifact__state { margin: 0; color: ${T.textSecondary}; }
.lens-artifact__state[role="alert"] { color: ${T.error}; }
.lens-artifact__state code { font-family: ${T.fontMono}; font-size: 11px; }
.lens-artifact__card {
  border: 1px solid ${T.border};
  border-radius: 8px;
  padding: 8px 10px;
  background: ${T.bgElevated};
  font-family: ${T.fontSans};
  font-size: 12px;
}
.lens-artifact__pane .lens-artifact__card { border: none; padding: 0; background: transparent; }
.lens-artifact__card-title { font-weight: 600; margin-bottom: 4px; }
.lens-artifact__meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 10px;
  margin: 0 0 6px;
}
.lens-artifact__meta dt { color: ${T.textMuted}; }
.lens-artifact__meta dd { margin: 0; overflow-wrap: anywhere; }
.lens-artifact__mono { font-family: ${T.fontMono}; font-size: 11px; }
.lens-artifact__preview {
  margin: 0;
  padding: 6px 8px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgPrimary};
  color: ${T.textSecondary};
  font-family: ${T.fontMono};
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.lens-artifact__note { margin: 4px 0 0; color: ${T.textMuted}; font-size: 11px; }
.lens-artifact__actions { display: flex; gap: 6px; margin-top: 6px; }
.lens-artifact__actions button {
  padding: 4px 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgTertiary};
  color: ${T.textPrimary};
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.lens-artifact__actions button:hover { border-color: ${T.primary}; }
.lens-artifact__table-wrap { max-height: 320px; overflow: auto; }
.lens-artifact__table {
  border-collapse: collapse;
  width: 100%;
  font-family: ${T.fontMono};
  font-size: 11px;
}
.lens-artifact__table th,
.lens-artifact__table td {
  border: 1px solid ${T.border};
  padding: 3px 6px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.lens-artifact__table th {
  position: sticky;
  top: 0;
  background: ${T.bgTertiary};
  color: ${T.textPrimary};
}
.lens-artifact__table td { color: ${T.textSecondary}; }

/* ── Typed HITL (awaiting pane, option picker, answer boxes) ─────────── */
.lens-hitl__pane {
  border: 1px solid ${T.border};
  border-radius: 8px;
  padding: 8px 10px;
  background: ${T.bgSecondary};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
  font-size: 12px;
  line-height: 1.5;
}
.lens-hitl__question { margin: 0 0 6px; font-weight: 600; }
.lens-hitl__state { margin: 0 0 6px; color: ${T.textSecondary}; }
.lens-hitl__state[role="alert"] { color: ${T.error}; }
.lens-hitl__state code { font-family: ${T.fontMono}; font-size: 11px; }
.lens-hitl__sentence { margin: 0; font-weight: 600; }
.lens-hitl__note { margin: 4px 0 0; color: ${T.textMuted}; font-size: 11px; }
.lens-hitl__note code { font-family: ${T.fontMono}; font-size: 11px; overflow-wrap: anywhere; }
.lens-hitl__picker { margin-top: 2px; }
.lens-hitl__options {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lens-hitl__options button,
.lens-hitl__answer button {
  padding: 4px 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgTertiary};
  color: ${T.textPrimary};
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.lens-hitl__options button { width: 100%; }
.lens-hitl__options button:hover,
.lens-hitl__answer button:hover:not(:disabled) { border-color: ${T.primary}; }
.lens-hitl__answer button:disabled { opacity: 0.5; cursor: not-allowed; }
.lens-hitl__answer { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.lens-hitl__answer--consent { flex-direction: column; align-items: stretch; }
.lens-hitl__consent-buttons { display: flex; gap: 6px; }
.lens-hitl__input {
  flex: 1;
  min-width: 160px;
  padding: 4px 8px;
  border: 1px solid ${T.border};
  border-radius: 6px;
  background: ${T.bgPrimary};
  color: ${T.textPrimary};
  font: inherit;
  font-size: 11px;
}

/* ── Group mode — the active group is a named place ───────────────── */
/* Only ever painted when the chart is scrubbed by the GROUPED ruler
   (<LensFlow granularity="group">). On the per-commit ruler none of these
   classes exist, so the chart renders exactly as it always has.

   The wrapper is deliberately unpositioned: xyflow's .react-flow__node
   stays the nearest positioned ancestor, so the accent below covers the real
   node box and the node's handles are where they were. */
.lens-group-node { display: block; }

/* ONE accent for every member, whatever KIND of node it is — the LLM call, the
   tool and the context pill light identically. What the node IS stays readable
   in its icon and its shape; how loud it is no longer depends on its type. */
.lens-group-node--member::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  background: color-mix(in srgb, ${T.groupAccent} 16%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, ${T.groupAccent} 55%, transparent);
  pointer-events: none;
  transition: background 240ms ease, box-shadow 240ms ease;
}
/* Everything outside the group recedes by the same amount — a uniform
   background, not a second ranking. */
.lens-group-node--outsider {
  opacity: 0.32;
  filter: saturate(0.45);
  transition: opacity 240ms ease, filter 240ms ease;
}

/* The drawn container. Quiet on purpose: a place you are standing in, not an
   alarm. Never takes pointer events, so the nodes inside stay clickable. */
.lens-group-boundary {
  border: 1.5px dashed color-mix(in srgb, ${T.groupAccent} 55%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, ${T.groupAccent} 7%, transparent);
  pointer-events: none;
  transition: transform 320ms ease, width 320ms ease, height 320ms ease;
}
/* The group's name, on the outline's top edge. Same string the WHAT HAPPENED
   boundary rail uses — one naming source (see groupDisplayName.ts). */
.lens-group-boundary-name {
  position: absolute;
  top: 0;
  left: 14px;
  transform: translateY(-50%);
  max-width: calc(100% - 28px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 9px;
  border: 1px solid color-mix(in srgb, ${T.groupAccent} 45%, transparent);
  border-radius: 999px;
  background: ${T.bgElevated};
  color: ${T.textPrimary};
  font-family: ${T.fontSans};
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .lens-group-boundary,
  .lens-group-node--member::after,
  .lens-group-node--outsider { transition: none; }
}
`;

/**
 * Put the stylesheet in the document once. Safe to call from every render of
 * every component that needs it — the marker makes repeats a no-op, and there
 * is no `document` to touch under SSR.
 */
export function ensureLensStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[${STYLE_MARKER}]`)) return;
  const el = document.createElement('style');
  el.setAttribute(STYLE_MARKER, STYLE_VERSION);
  el.textContent = LENS_STYLESHEET;
  document.head.appendChild(el);
}
