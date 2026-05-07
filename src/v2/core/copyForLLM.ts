/**
 * `buildLLMText(recorder, stepGraph)` — assembles a single Markdown
 * blob describing the entire run, ready to paste into a chat (Claude,
 * ChatGPT) for debugging assistance.
 *
 * Design parallel to footprint-explainable-ui's NarrativePanel "Copy
 * for LLM" — same audience (a developer asking an LLM "why did this
 * happen?"), same shape (run summary + per-step payloads + per-
 * boundary rollups + commentary). Lens-specific because the data
 * sources are the StepGraph + BoundaryRecorder + LensRecorder
 * (extends SequenceRecorder<EventLogEntry>), not the footprintjs
 * narrative entries.
 *
 * Sections produced (in order):
 *
 *   1. Run Summary                — status, duration, totals
 *   2. Per-Boundary Rollups       — one block per Agent / LLMCall /
 *                                    Sequence / etc. (multi-agent runs
 *                                    benefit most; single-Agent runs
 *                                    print one block)
 *   3. Steps                      — every visible StepNode with its
 *                                    payload (assistantText / toolArgs
 *                                    / toolResult / final answer /
 *                                    boundary entry+exit payloads)
 *   4. Commentary                 — humanized per-event lines (one
 *                                    per emitted event, time-stamped)
 *
 * Pure projection — no DOM, no clipboard. The caller (Lens.tsx) wires
 * the result to navigator.clipboard.writeText().
 */

import type { StepGraph, StepNode, BoundaryAggregate } from 'agentfootprint';
import type { LensRecorder } from './LensRecorder.js';
import type { Humanizer } from './humanizer.js';

export interface BuildLLMTextArgs {
  readonly recorder: LensRecorder;
  readonly stepGraph?: StepGraph;
  /** Optional per-boundary rollups (from
   *  `BoundaryRecorder.aggregateAllBoundaries`). When provided, the
   *  output includes a "Per-Boundary Rollups" section keyed by
   *  runtimeStageId. */
  readonly boundaryRollups?: readonly BoundaryAggregate[];
  /** Humanizer used to render the Commentary section. Defaults to a
   *  bare `[type]` formatter when not supplied. */
  readonly humanizer?: Humanizer;
  /** App name woven into commentary lines. Default: `'Chatbot'`. */
  readonly appName?: string;
}

/** Build the full LLM-ready Markdown blob for the current run. */
export function buildLLMText(args: BuildLLMTextArgs): string {
  const { recorder, stepGraph, boundaryRollups, humanizer, appName = 'Chatbot' } = args;
  const summary = recorder.selectSummary();
  const log = recorder.selectEventLog();

  const sections: string[] = [];

  // ── 1. Run Summary ────────────────────────────────────────────
  // Adaptive — rows are only emitted when their value is meaningful.
  // Avoids "Iterations: 0" / "Tool calls: 0" noise on Sequence-of-
  // LLMCalls runs that don't have ReAct iterations or tools.
  sections.push('# Run Summary\n');
  sections.push(`- **Status:** ${summary.status}`);
  if (summary.durationMs !== undefined) {
    sections.push(`- **Duration:** ${formatMs(summary.durationMs)}`);
  }
  if (summary.llmCallCount > 0) sections.push(`- **LLM calls:** ${summary.llmCallCount}`);
  if (summary.toolCallCount > 0) sections.push(`- **Tool calls:** ${summary.toolCallCount}`);
  if (summary.iterationCount > 0) sections.push(`- **Iterations:** ${summary.iterationCount}`);
  if (summary.totalTokens.input > 0 || summary.totalTokens.output > 0) {
    sections.push(
      `- **Tokens:** ${summary.totalTokens.input} in / ${summary.totalTokens.output} out`,
    );
  }
  if (summary.totalUsd !== undefined) sections.push(`- **Estimated cost:** $${summary.totalUsd.toFixed(4)}`);
  if (summary.permissionDenials > 0) sections.push(`- **Permission denials:** ${summary.permissionDenials}`);
  if (summary.paused) sections.push(`- **Paused:** yes`);

  // ── 2. Per-Boundary Rollups ──────────────────────────────────
  if (boundaryRollups && boundaryRollups.length > 0) {
    sections.push('\n# Per-Boundary Rollups\n');
    for (const r of boundaryRollups) {
      const kind = r.primitiveKind ?? 'Boundary';
      sections.push(`## ${r.label} (${kind}) — \`${r.runtimeStageId}\``);
      if (r.tokens.input > 0 || r.tokens.output > 0) {
        sections.push(`- Tokens: ${r.tokens.input} in / ${r.tokens.output} out`);
      }
      const counters: string[] = [];
      if (r.llmCalls > 0) counters.push(`LLM calls: ${r.llmCalls}`);
      if (r.toolCalls > 0) counters.push(`Tool calls: ${r.toolCalls}`);
      if (r.iterations > 0) counters.push(`Iterations: ${r.iterations}`);
      if (counters.length > 0) sections.push(`- ${counters.join(' · ')}`);
      sections.push(
        `- Duration: ${r.durationMs !== undefined ? formatMs(r.durationMs) : '(in flight)'}`,
      );
      sections.push('');
    }
  }

  // ── 3. Steps (every StepNode with payload) ───────────────────
  if (stepGraph && stepGraph.nodes.length > 0) {
    sections.push('\n# Steps\n');
    stepGraph.nodes.forEach((n, i) => {
      sections.push(formatStep(i + 1, n));
    });
  }

  // ── 4. Commentary (humanized per-event lines) ────────────────
  if (log.length > 0) {
    sections.push('\n# Commentary\n');
    sections.push('```');
    for (const entry of log) {
      const line = humanizer ? humanizer(entry.event) : `[${entry.event.type}]`;
      if (line === null) continue;
      const t = `+${Math.round(entry.runOffsetMs)}ms`.padEnd(10);
      sections.push(`${t} ${line.replace(/\{\{appName\}\}/g, appName)}`);
    }
    sections.push('```');
  }

  return sections.join('\n');
}

// ─── Boundary-payload filtering ──────────────────────────────────
//
// LLMCall's outputMapper merges the entire scope state into the boundary
// output, including library-internal accounting fields. For Copy-for-LLM
// purposes those fields are noise — they're already represented in
// other sections (Tokens line on the LLM step, Context Injections, etc.)
// and pasting them inflates the document by ~80% with redundant info.
const LIBRARY_INTERNAL_FIELDS = new Set([
  'systemPromptInjections',
  'messagesInjections',
  'toolsInjections',
  'cumTokensInput',
  'cumTokensOutput',
  'cumEstimatedUsd',
  'costBudgetHit',
  'iteration',
]);

function compactBoundaryPayload(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (LIBRARY_INTERNAL_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// ─── Step formatter ──────────────────────────────────────────────

function formatStep(index: number, n: StepNode): string {
  const lines: string[] = [];
  const headerSuffix = n.iterationIndex !== undefined ? ` (iter ${n.iterationIndex})` : '';
  const kindLabel = formatKindLabel(n);
  lines.push(`## ${index}. ${n.label} — ${kindLabel}${headerSuffix}`);
  if (n.runtimeStageId) lines.push(`runtimeStageId: \`${n.runtimeStageId}\``);
  if (n.subflowPath.length > 1) {
    lines.push(`Path: ${n.subflowPath.slice(1).join(' → ')}`);
  }

  const dur = duration(n);
  // Hide 0ms duration on closing markers (`llm → user` is a delivery
  // marker, not a separate execution — duration is naturally 0).
  if (dur !== undefined && dur > 0) lines.push(`Duration: ${formatMs(dur)}`);
  if (n.tokens) lines.push(`Tokens: ${n.tokens.in} in / ${n.tokens.out} out`);
  if (n.llmModel) lines.push(`Model: ${n.llmModel}`);
  if (n.toolName) lines.push(`Tool: \`${n.toolName}\``);
  if (n.slotUpdated) lines.push(`Slot updated: \`${n.slotUpdated}\``);

  // Per-kind payload sections — same set of fields the right-pane
  // NodeDetailPanel renders.
  if (n.entryPayload !== undefined) {
    lines.push('\n**Boundary input** (inputMapper result):');
    lines.push('```json');
    lines.push(safeJson(compactBoundaryPayload(n.entryPayload)));
    lines.push('```');
  }
  if (n.exitPayload !== undefined) {
    lines.push('\n**Boundary output** (outputMapper result):');
    lines.push('```json');
    lines.push(safeJson(compactBoundaryPayload(n.exitPayload)));
    lines.push('```');
  }
  if (n.assistantText) {
    const heading =
      n.kind === 'llm->user' ? 'Final answer' : "LLM's reasoning";
    lines.push(`\n**${heading}:**`);
    lines.push('```');
    lines.push(n.assistantText);
    lines.push('```');
  }
  if (n.toolArgs !== undefined) {
    lines.push('\n**Tool input (args):**');
    lines.push('```json');
    lines.push(safeJson(n.toolArgs));
    lines.push('```');
  }
  if (n.toolResult !== undefined) {
    lines.push('\n**Tool result sent to LLM:**');
    lines.push('```json');
    lines.push(safeJson(n.toolResult));
    lines.push('```');
  }

  // Engineered injections (filtered to non-baseline sources by callers
  // typically — but here we include all so the LLM has full context).
  if (n.injections && n.injections.length > 0) {
    lines.push('\n**Context injections:**');
    for (const inj of n.injections) {
      const id = inj.sourceId ? `:${inj.sourceId}` : '';
      const role = inj.asRole ? ` (as ${inj.asRole})` : '';
      const summary = inj.contentSummary ? ` — ${inj.contentSummary}` : '';
      lines.push(`- [${inj.slot}] ${inj.source}${id}${role}${summary}`);
    }
  }

  lines.push(''); // trailing blank line between steps
  return lines.join('\n');
}

function formatKindLabel(n: StepNode): string {
  switch (n.kind) {
    case 'subflow':
      return n.primitiveKind ? `${n.primitiveKind} boundary` : 'subflow boundary';
    case 'user->llm':
      return 'user → llm';
    case 'llm->tool':
      return 'llm → tool';
    case 'tool->llm':
      return 'tool → llm';
    case 'llm->user':
      return 'llm → user (final answer)';
    case 'fork-branch':
      return 'parallel branch';
    case 'decision-branch':
      return 'decision branch';
    default:
      return n.kind;
  }
}

function duration(n: StepNode): number | undefined {
  if (typeof n.startOffsetMs === 'number' && typeof n.endOffsetMs === 'number') {
    return n.endOffsetMs - n.startOffsetMs;
  }
  return undefined;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function safeJson(value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length > 4000) {
      return s.slice(0, 4000) + `\n... (truncated; ${s.length - 4000} chars)`;
    }
    return s;
  } catch {
    return String(value);
  }
}
