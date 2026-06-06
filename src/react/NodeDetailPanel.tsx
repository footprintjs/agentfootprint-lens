/**
 * NodeDetailPanel — right-pane drawer that renders the data crossing
 * a selected subflow's boundary.
 *
 * Sourced from `StepNode.entryPayload` / `exitPayload` / `runtimeStageId`,
 * which agentfootprint's `FlowchartRecorder` populates from footprintjs's
 * `BoundaryRecorder`. The full data path:
 *
 *   inputMapper → BoundaryRecorder.entry → StepNode.entryPayload → here
 *   outputMapper → BoundaryRecorder.exit  → StepNode.exitPayload  → here
 *
 * The two payloads, side-by-side, give the developer an answer to:
 *   "what context flowed INTO this subflow, and what came OUT?"
 *
 * Empty states are intentional and informative:
 *   - Topology nodes (fork-branch / decision-branch) → never have
 *     payloads; we render a short note explaining why.
 *   - In-progress / paused subflows → entry only, exit shows
 *     "(in progress)" — matches the BoundaryRecorder semantics.
 */

import React from 'react';
import type { StepNode } from 'agentfootprint/observe';
import { T } from './theme/index.js';

export interface NodeDetailPanelProps {
  /** The selected step node, or undefined when nothing is selected. */
  readonly node?: StepNode;
  /**
   * StepNodes that ran INSIDE the cursor's scope (slot subflows,
   * ReAct steps). When `node` is an LLMCall/Agent boundary, these
   * carry the per-call richness — system prompt content, messages,
   * tools, model, tokens, response — that the panel surfaces stacked
   * underneath the primary input/output sections.
   *
   * Optional; when empty the panel renders the primary node only
   * (back-compat path for existing consumers/tests).
   */
  readonly relatedNodes?: readonly StepNode[];
  /**
   * The cursor's runtimeStageId — used as the empty-state hint when
   * `node` is undefined but the cursor IS positioned somewhere (the
   * panel can then surface scope context like "cursor at __root__ ·
   * Run start" instead of the generic "click a node" hint).
   */
  readonly cursorRuntimeStageId?: string;
  /**
   * Which Run boundary the cursor sits on, when it's a root cursor:
   * `'start'` (the human's input just went in) or `'end'` (the answer
   * came back out). Drives the "Run input" / "Run output" sections —
   * the real data the lens-invented User node represents. Undefined for
   * non-root cursors.
   */
  readonly rootPhase?: 'start' | 'end';
  /** The run's input payload (footprintjs `run.entry`) — what the human
   *  sent. Shown at Run · start. */
  readonly runInput?: unknown;
  /** The run's output payload (footprintjs `run.exit`) — the final
   *  answer returned to the human. Shown at Run · end. */
  readonly runOutput?: unknown;
  /** Fatal error message when the run FAILED. At Run · failed this
   *  replaces the "Final answer" section so the WHY is front-and-center. */
  readonly runError?: string;
  /** Optional close handler — when provided, renders an `×` close button. */
  readonly onClose?: () => void;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  node,
  relatedNodes,
  cursorRuntimeStageId,
  rootPhase,
  runInput,
  runOutput,
  runError,
  onClose,
}) => {
  if (!node) {
    // No primary StepNode at the cursor (e.g. `__root__#0` — Run
    // boundaries have no StepNode of their own; the User node is a
    // lens-invented visual bookend, not a stage). At those boundaries we
    // surface the REAL data the User node stands for: the run input at
    // Run · start, the final answer at Run · end — plus the run overview.
    const isRoot = cursorRuntimeStageId?.startsWith('__root__') ?? false;
    const hasRelated = !!relatedNodes && relatedNodes.length > 0;
    // At the terminal boundary, a failed run shows the error in place of
    // the (absent) final answer.
    const showRunError = isRoot && rootPhase === 'end' && runError !== undefined;
    const showRunIO =
      isRoot &&
      ((rootPhase === 'start' && runInput !== undefined) ||
        (rootPhase === 'end' && runOutput !== undefined));

    if (showRunError || showRunIO || hasRelated) {
      return (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={titleStyle}>{isRoot ? 'Run' : 'Scope'}</span>
              <span style={{ ...pillStyle, ...(showRunError ? { background: T.error } : {}) }}>
                {showRunError
                  ? 'failed'
                  : rootPhase === 'start'
                    ? 'input'
                    : rootPhase === 'end'
                      ? 'output'
                      : isRoot
                        ? 'overview'
                        : 'in scope'}
              </span>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                style={closeButtonStyle}
                aria-label="Close detail panel"
                title="Close"
              >
                ×
              </button>
            )}
          </div>
          <div style={bodyStyle}>
            {/* Run · failed → the error (the WHY). Run · start → what the
                human sent. Run · end → the answer returned. All are real
                footprintjs root-boundary data, NOT a fabricated stage. */}
            {showRunError && (
              <div style={{ ...sectionStyle, borderColor: T.error }}>
                <div style={{ ...sectionLabelStyle, padding: '4px 8px', color: T.error }}>
                  ⛔ Run failed
                </div>
                <pre style={{ ...preStyle, color: T.error }}>{runError}</pre>
              </div>
            )}
            {rootPhase === 'start' && runInput !== undefined && (
              <PayloadSection label="You sent" payload={runInput} emptyHint="(no input recorded)" />
            )}
            {!showRunError && rootPhase === 'end' && runOutput !== undefined && (
              <PayloadSection label="Final answer" payload={runOutput} emptyHint="(no output recorded)" />
            )}
            {hasRelated && <RelatedStepsSection nodes={relatedNodes!} />}
          </div>
        </div>
      );
    }
    return (
      <div style={emptyPanelStyle}>
        <div style={emptyHintStyle}>
          {isRoot
            ? 'Scrub past Run · start to inspect a stage'
            : 'Click a node to inspect'}
        </div>
      </div>
    );
  }

  const isSubflow = node.kind === 'subflow';
  const isTopologyHelper = node.kind === 'fork-branch' || node.kind === 'decision-branch';

  return (
    <div style={panelStyle}>
      {/* Header — title + close + identity strip */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={titleStyle}>{node.label}</span>
          {node.primitiveKind && <span style={pillStyle}>{node.primitiveKind}</span>}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={closeButtonStyle}
            aria-label="Close detail panel"
            title="Close"
          >
            ×
          </button>
        )}
      </div>

      <IdentityStrip node={node} />

      {/* Body — entry/exit payloads in the user's vocabulary, NOT the
          library's. The labels change per primitiveKind so a student
          reading the panel sees "Run input / output", "Agent input /
          response", "LLM call payload", etc. — never internal terms
          like inputMapper / outputMapper / subflow. */}
      <div style={bodyStyle}>
        {isSubflow && (
          <>
            <PayloadSection
              label={inputLabelFor(node)}
              payload={node.entryPayload}
              emptyHint="(no input recorded for this step)"
            />
            <PayloadSection
              label={outputLabelFor(node)}
              payload={node.exitPayload}
              emptyHint={
                node.entryPayload && !node.exitPayload
                  ? 'In progress — this step has not finished yet.'
                  : '(no output recorded for this step)'
              }
            />
          </>
        )}
        {isTopologyHelper && (
          <div style={topologyNoteStyle}>
            This is a {node.kind === 'fork-branch' ? 'parallel branch' : 'decision branch'}{' '}
            marker — composition shape only. Boundary payloads attach to the subflow that the
            branch runs (if any), not to this marker itself.
          </div>
        )}
        {!isSubflow && !isTopologyHelper && (
          <ReActStepBody node={node} />
        )}

        {/* Cursor-scoped "all related" section — surfaces every StepNode
            that ran INSIDE this scope so an LLMCall/Agent boundary shows
            its full per-call richness (system prompt content, messages,
            tools, model, tokens, response) stacked under the primary
            entry/exit payloads. Filters out fork/decision topology
            helpers since they never carry useful per-step data. */}
        {relatedNodes && relatedNodes.length > 0 && (
          <RelatedStepsSection nodes={relatedNodes} />
        )}
      </div>
    </div>
  );
};

// ── Related-steps section ──────────────────────────────────────────────
//
// Renders every StepNode in the cursor's scope as a compact card. Each
// card surfaces the data shape that matters for that step kind — slot
// boundaries get their composed-content payload, ReAct steps get
// model+tokens+response, slot subflows get their input/output. Designed
// to read top-to-bottom as the chronological story of "what the LLM
// actually saw and produced."

const RelatedStepsSection: React.FC<{
  nodes: readonly StepNode[];
}> = ({ nodes }) => {
  const renderable = nodes.filter(
    (n) => n.kind !== 'fork-branch' && n.kind !== 'decision-branch',
  );
  if (renderable.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ ...sectionLabelStyle, marginBottom: 6, padding: '0 2px' }}>
        All steps in this scope
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {renderable.map((n) => (
          <RelatedStepCard key={n.id} node={n} />
        ))}
      </div>
    </div>
  );
};

const RelatedStepCard: React.FC<{ node: StepNode }> = ({ node }) => {
  // Compact title: kind + label so a reader can see "user→llm · call-llm"
  // at a glance and decide whether to expand the payload.
  const title = node.label && node.label !== node.kind
    ? `${node.kind} · ${node.label}`
    : node.kind;

  // Per-kind metadata rows (model/tokens/tool/slot/duration).
  const duration =
    typeof node.startOffsetMs === 'number' && typeof node.endOffsetMs === 'number'
      ? node.endOffsetMs - node.startOffsetMs
      : undefined;
  const rows: Array<[string, string]> = [];
  if (node.llmModel) rows.push(['model', node.llmModel]);
  if (node.tokens) rows.push(['tokens', `in ${node.tokens.in} · out ${node.tokens.out}`]);
  if (node.toolName) rows.push(['tool', node.toolName]);
  if (node.slotUpdated) rows.push(['updated slot', node.slotUpdated]);
  if (duration !== undefined && duration > 0) {
    rows.push(['duration', `${Math.round(duration)}ms`]);
  }

  // Per-kind payload sections. We prefer fully-typed StepNode fields
  // (assistantText, slotBoundaries, toolArgs, toolResult, entry/exit)
  // over a generic "dump whatever's there" since each has a clear
  // user-facing label.
  const payloads: Array<{ label: string; value: unknown }> = [];
  if (node.kind === 'subflow') {
    if (node.entryPayload !== undefined) {
      payloads.push({ label: inputLabelFor(node), value: node.entryPayload });
    }
    if (node.exitPayload !== undefined) {
      payloads.push({ label: outputLabelFor(node), value: node.exitPayload });
    }
  }
  if (node.slotBoundaries) {
    if (node.slotBoundaries.systemPrompt) {
      payloads.push({
        label: 'System prompt (composed)',
        value: node.slotBoundaries.systemPrompt.exitPayload,
      });
    }
    if (node.slotBoundaries.messages) {
      payloads.push({
        label: 'Messages (composed)',
        value: node.slotBoundaries.messages.exitPayload,
      });
    }
    if (node.slotBoundaries.tools) {
      payloads.push({
        label: 'Tools (composed)',
        value: node.slotBoundaries.tools.exitPayload,
      });
    }
  }
  if (node.assistantText) {
    const label =
      node.kind === 'llm->user'
        ? 'Final answer'
        : node.kind === 'llm->tool'
          ? "LLM's reasoning"
          : 'LLM text';
    payloads.push({ label, value: node.assistantText });
  }
  if (node.toolArgs !== undefined) {
    payloads.push({ label: 'Tool input (args)', value: node.toolArgs });
  }
  if (node.toolResult !== undefined) {
    payloads.push({ label: 'Tool result', value: node.toolResult });
  }

  const hasContent = rows.length > 0 || payloads.length > 0;

  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={{ ...sectionLabelStyle, textTransform: 'none' }}>{title}</span>
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 4, fontSize: 12, padding: 8 }}>
          {rows.map(([label, value]) => (
            <Field key={label} label={label}>{value}</Field>
          ))}
        </div>
      )}
      {payloads.map((p) => (
        <div key={p.label} style={{ borderTop: `1px solid ${T.border}` }}>
          <div style={{ ...sectionLabelStyle, padding: '4px 8px' }}>{p.label}</div>
          <pre style={preStyle}>{prettyPrint(p.value)}</pre>
        </div>
      ))}
      {!hasContent && (
        <div style={emptyHintStyle}>(no data recorded for this step)</div>
      )}
    </div>
  );
};

// ── Identity strip ─────────────────────────────────────────────────────
//
// Compact secondary metadata (iteration number, depth) — kept tiny so
// the structured payload sections stay the visual focus. Library
// internals like `runtimeStageId` and the path-prefixed `subflowId` are
// hidden by default; advanced users can read them in the Trace tab
// where they're the canonical key.

const IdentityStrip: React.FC<{ node: StepNode }> = ({ node }) => {
  // If there's nothing meaningful to show, render nothing — keeps the
  // panel's vertical density tight for simple steps.
  if (typeof node.iterationIndex !== 'number' && node.subflowPath.length <= 1) {
    return null;
  }
  return (
    <div style={identityStripStyle}>
      {typeof node.iterationIndex === 'number' && (
        <IdentityField label="iteration" value={`#${node.iterationIndex}`} />
      )}
      {node.subflowPath.length > 1 && (
        <IdentityField
          label="under"
          // path is rooted under '__root__' — show only the agent-level
          // segments by skipping the synthetic root prefix.
          value={node.subflowPath.slice(1, -1).join(' / ') || '(top level)'}
        />
      )}
    </div>
  );
};

const IdentityField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span style={identityLabelStyle}>{label}</span>
    <span style={identityValueStyle}>{value}</span>
  </div>
);

// ── Per-primitive label helpers ────────────────────────────────────────
//
// User-facing wording — avoids leaking footprintjs internals like
// "inputMapper / subflow / outputMapper" into the teaching surface.

function inputLabelFor(node: StepNode): string {
  if (node.primitiveKind === 'Run' || node.subflowPath[0] === '__root__' &&
      node.subflowPath.length === 1) return 'Run input';
  if (node.primitiveKind === 'Agent') return 'Agent input';
  if (node.primitiveKind === 'LLMCall') return 'LLM call input';
  return 'Input';
}

function outputLabelFor(node: StepNode): string {
  if (node.primitiveKind === 'Run' || node.subflowPath[0] === '__root__' &&
      node.subflowPath.length === 1) return 'Run output';
  if (node.primitiveKind === 'Agent') return 'Agent response';
  if (node.primitiveKind === 'LLMCall') return 'LLM call output';
  return 'Output';
}

// ── Payload section ────────────────────────────────────────────────────

const PayloadSection: React.FC<{
  label: string;
  payload?: unknown;
  emptyHint: string;
}> = ({ label, payload, emptyHint }) => {
  const hasPayload =
    payload !== undefined &&
    payload !== null &&
    !(typeof payload === 'object' && Object.keys(payload as object).length === 0);
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>{label}</span>
      </div>
      {hasPayload ? (
        <pre style={preStyle}>{prettyPrint(payload)}</pre>
      ) : (
        <div style={emptyHintStyle}>{emptyHint}</div>
      )}
    </div>
  );
};

// ── ReAct step body (user→llm / llm→tool / tool→llm / llm→user) ────────

const ReActStepBody: React.FC<{ node: StepNode }> = ({ node }) => {
  // Compute the duration only when both endpoints are recorded — avoids
  // showing a `+139ms` t-start with no companion t-end (always-present
  // start offsets were noise per the user feedback: "no update, don't
  // render"). Adaptive: rows are emitted only when they have data
  // worth surfacing.
  const duration =
    typeof node.startOffsetMs === 'number' && typeof node.endOffsetMs === 'number'
      ? node.endOffsetMs - node.startOffsetMs
      : undefined;
  // The visible field rows. We render only those with a meaningful value.
  const rows: Array<[string, React.ReactNode]> = [];
  if (node.tokens) rows.push(['tokens', `in ${node.tokens.in} · out ${node.tokens.out}`]);
  if (node.toolName) rows.push(['tool', node.toolName]);
  if (node.llmModel) rows.push(['model', node.llmModel]);
  if (node.slotUpdated) rows.push(['what landed in', node.slotUpdated]);
  if (duration !== undefined && duration > 0) rows.push(['duration', `${Math.round(duration)}ms`]);

  // Per-kind input/output payloads. Each ReAct step has a clear
  // "what arrived" and "what was produced" — surface them so a developer
  // reading the panel can see the actual data flowing through, not just
  // metadata rows.
  const ioSections = ioSectionsFor(node);
  return (
    <>
      <div style={sectionStyle}>
        {/* No "ReAct step / user→llm" sub-header — the panel header
            already states it. Hidden per "stop leaking library terms +
            stop showing redundant rows" feedback. */}
        {rows.length > 0 && (
          <div style={{ display: 'grid', gap: 4, fontSize: 12, padding: 8 }}>
            {rows.map(([label, value]) => (
              <Field key={label} label={label}>
                {value}
              </Field>
            ))}
          </div>
        )}
        {(() => {
          // Context engineering = engineered injections ONLY. Baseline
          // sources are LLM-API natives, not engineering decisions.
          // Hidden when nothing is engineered — adaptive rendering: only
          // surface fields that have meaningful UPDATE / ADD content.
          const engineered = (node.injections ?? []).filter(
            (inj) => !BASELINE_SOURCES.has(inj.source),
          );
          if (engineered.length === 0) return null;
          return (
            <div style={{ padding: '0 8px 8px' }}>
              <div style={sectionLabelStyle}>Context engineering</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 14, fontSize: 11, color: T.textSecondary }}>
                {engineered.map((inj, i) => (
                  <li key={i} style={{ padding: '2px 0' }}>
                    <code style={{ fontSize: 11 }}>
                      [{inj.slot}] {inj.source}
                      {inj.sourceId ? `:${inj.sourceId}` : ''}
                    </code>
                    {inj.contentSummary && (
                      <span style={{ opacity: 0.7, marginLeft: 6 }}>· {inj.contentSummary}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
      {ioSections.map((s) => (
        <PayloadSection key={s.label} label={s.label} payload={s.payload} emptyHint="(none)" />
      ))}
    </>
  );
};

/**
 * Per-kind Input/Output sections. The user's mental model:
 *
 *   user→llm   — input: user message (carried via slot boundaries)
 *   llm→tool   — input: LLM's reasoning text · output: tool args (JSON)
 *   tool→llm   — input: tool result (JSON) → next LLM call
 *   llm→user   — output: final answer text
 *
 * Sections with no payload are omitted (adaptive — don't show empty rows).
 */
function ioSectionsFor(
  node: StepNode,
): Array<{ label: string; payload: unknown }> {
  const out: Array<{ label: string; payload: unknown }> = [];
  switch (node.kind) {
    case 'llm->tool': {
      if (node.assistantText) {
        out.push({ label: "LLM's reasoning", payload: node.assistantText });
      }
      if (node.toolArgs !== undefined) {
        out.push({ label: 'Tool input (args)', payload: node.toolArgs });
      }
      break;
    }
    case 'tool->llm': {
      if (node.toolResult !== undefined) {
        out.push({ label: 'Tool result sent to LLM', payload: node.toolResult });
      }
      break;
    }
    case 'llm->user': {
      if (node.assistantText) {
        out.push({ label: 'Final answer', payload: node.assistantText });
      }
      break;
    }
    case 'user->llm':
    default:
      // No extra I/O sections for user→llm — the user message already
      // shows up via the `messages` slot boundary list inside the LLM
      // card; surfacing it again here would be redundant.
      break;
  }
  return out;
}

/**
 * Sources that are NATIVE channels of every LLM API — not context
 * engineering decisions. Filtered out of the panel's "Context engineering"
 * section so only engineered injections (rag / skill / memory /
 * instructions / custom) show up. Mirrors the planned
 * `enable.contextEngineering()` filter.
 */
const BASELINE_SOURCES: ReadonlySet<string> = new Set([
  'user',          // current-turn user message
  'tool-result',   // tool's return value, post-execution
  'assistant',     // prior assistant turn replayed in messages
  'base',          // static system-prompt declared at build time
  'registry',      // tool from the static tool registry
]);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    <span style={{ color: T.textSecondary, fontVariant: 'small-caps', minWidth: 80 }}>{label}</span>
    <span style={{ color: T.textPrimary }}>{children}</span>
  </div>
);

// ── Pretty-print payload ───────────────────────────────────────────────

/** JSON.stringify with indent=2, plus truncation guard for huge values.
 *  Strings render as raw text (no enclosing quotes) so reasoning / answer
 *  blobs read like prose, not like a serialized literal. */
function prettyPrint(value: unknown): string {
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else {
    try {
      str = JSON.stringify(value, null, 2);
    } catch {
      return '(unable to serialize)';
    }
  }
  if (str.length > 4000) {
    return str.slice(0, 4000) + '\n\n... (truncated; ' + (str.length - 4000) + ' chars)';
  }
  return str;
}

// ── Styles ─────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: T.bgElevated,
  borderLeft: `1px solid ${T.border}`,
  fontFamily: T.fontSans,
  height: '100%',
  overflow: 'hidden',
};

const emptyPanelStyle: React.CSSProperties = {
  ...panelStyle,
  alignItems: 'center',
  justifyContent: 'center',
  background: T.bgElevated,
};

const emptyHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: T.textSecondary,
  fontStyle: 'italic',
  padding: 12,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '12px 14px 6px',
  borderBottom: `1px solid ${T.border}`,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: T.textPrimary,
};

const pillStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#fff',
  background: T.primary,
  padding: '2px 6px',
  borderRadius: 3,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 18,
  lineHeight: 1,
  color: T.textSecondary,
  cursor: 'pointer',
  padding: '0 4px',
};

const identityStripStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  padding: '6px 14px',
  borderBottom: `1px solid ${T.border}`,
  fontSize: 11,
};

const identityLabelStyle: React.CSSProperties = {
  color: T.textSecondary,
  fontVariant: 'small-caps',
  letterSpacing: 0.3,
};

const identityValueStyle: React.CSSProperties = {
  color: T.textSecondary,
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  overflowY: 'auto',
  flex: 1,
};

const sectionStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  background: T.bgElevated,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '6px 8px',
  borderBottom: `1px solid ${T.border}`,
  background: T.bgElevated,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const sectionHintStyle: React.CSSProperties = {
  fontSize: 10,
  color: T.textSecondary,
  fontFamily: T.fontMono,
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  fontSize: 11,
  fontFamily: T.fontMono,
  color: T.textPrimary,
  background: T.bgElevated,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 200,
  overflow: 'auto',
};

const topologyNoteStyle: React.CSSProperties = {
  fontSize: 12,
  color: T.textSecondary,
  padding: 12,
  background: T.bgElevated,
  border: `1px solid ${T.border}`,
  borderRadius: 4,
  lineHeight: 1.5,
};
