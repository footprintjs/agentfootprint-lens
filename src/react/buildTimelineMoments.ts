/**
 * buildTimelineMoments — turn the slider's cursor stops into "WHAT HAPPENED"
 * timeline moments (the right-rail dots).
 *
 * Pure + testable. Extracted from `Lens.tsx` so the (large) component stays
 * focused on wiring rather than carrying this glue inline.
 *
 * Each moment = one cursor stop, with:
 *   - title:       a short headline — a tool call becomes "Called <tool>",
 *                  everything else uses the clean milestone label
 *   - description: the verbose humanized prose (shown in the expanded card), or
 *                  a short generic so the card is never empty
 *   - offsetMs:    when it ran — the commentary entry's run offset, falling back
 *                  to the runtime overlay's recorded time
 *   - icon:        a glyph for the moment kind
 */

import type { CursorPosition, ExecOrderEntry } from '../core/group/cursorPositionsAtDrill.js';
import type { Humanizer } from '../core/humanizer.js';
import type { EventLogEntry } from '../core/types.js';
import type { TimelineMoment } from './WhatHappenedTimeline.js';

/** A small glyph per moment kind — derived from the cursor stop's label/kind.
 *  Lens-domain mapping (the timeline component stays icon-agnostic). */
export function momentIcon(label: string, kind: string): string {
  const l = label.toLowerCase();
  if (l.includes('run · start')) return '▸';
  if (l.includes('run · end')) return '✓';
  if (kind === 'parallel' || l.includes('context')) return '❖';
  if (l.includes('iteration')) return '↻';
  if (l.includes('llm')) return '◆';
  if (l.includes('tool')) return '⚙';
  if (l.includes('route') || l.includes('decision')) return '◇';
  if (l.includes('gather')) return '⬇';
  if (l.includes('evaluate')) return '▦';
  if (l.includes('delta')) return 'Δ';
  if (l.includes('final') || l.includes('respond')) return '▣';
  return '•';
}

/** A short fallback description for a milestone stop with no humanized prose
 *  (e.g. a "Context" parallel stop) — keeps the expanded card from showing the
 *  bare "Click a node to inspect" placeholder. */
function genericDescription(label: string): string | undefined {
  const l = label.toLowerCase();
  if (l.startsWith('context')) return "Assembled this turn's context.";
  if (l.startsWith('iteration')) return 'Started a ReAct iteration.';
  if (l.startsWith('llm turn')) return 'Called the LLM to decide the next step.';
  if (l.startsWith('route')) return 'Routed to the next step.';
  if (l.includes('run · start')) return 'The run started.';
  if (l.includes('run · end')) return 'The run finished.';
  return undefined;
}

export interface BuildTimelineMomentsInput {
  readonly cursorPositions: readonly CursorPosition[];
  /** Per-stop event-log seq (from the commentary cutoff resolution). */
  readonly commentarySeqs: readonly number[];
  readonly log: readonly EventLogEntry[];
  readonly humanizer: Humanizer;
  /** The runtime overlay's executionOrder — fallback source for timestamps. */
  readonly executionOrder: readonly ExecOrderEntry[];
}

export function buildTimelineMoments({
  cursorPositions,
  commentarySeqs,
  log,
  humanizer,
  executionOrder,
}: BuildTimelineMomentsInput): TimelineMoment[] {
  const bySeq = new Map<number, EventLogEntry>();
  for (const e of log) bySeq.set(e.seq, e);

  return cursorPositions.map((cp, i) => {
    const seq = commentarySeqs[i];
    const entry = seq !== undefined && seq >= 0 ? bySeq.get(seq) : undefined;
    // The humanizer prose is the DESCRIPTION (shown in the expanded card), not
    // the title — putting it in the title made moments 3 lines of prose. Skip
    // raw "[namespace.event]" emit lines (passed through verbatim).
    const raw = entry ? humanizer(entry.event) : null;
    const prose = raw && !raw.trimStart().startsWith('[') ? raw : null;

    // TITLE — a short headline. A tool call becomes "Called <tool>"; everything
    // else uses the clean milestone label ("LLM turn 2", "Context 3").
    let title = cp.label;
    const toolMatch = prose ? /called the [`']?([\w.-]+)[`']? tool/i.exec(prose) : null;
    if (toolMatch) title = `Called ${toolMatch[1]}`;

    // DESCRIPTION — the verbose prose, or a short generic so the expanded card
    // is never empty ("Click a node to inspect" felt broken on Context stops).
    const description = prose ?? genericDescription(cp.label);

    let offsetMs = entry?.runOffsetMs;
    if (offsetMs === undefined) {
      offsetMs = executionOrder.find((e) => e.runtimeStageId === cp.runtimeStageId)?.timestampMs;
    }

    return {
      runtimeStageId: cp.runtimeStageId,
      title,
      ...(description ? { description } : {}),
      ...(offsetMs !== undefined ? { offsetMs } : {}),
      icon: momentIcon(cp.label, cp.kind),
    };
  });
}
