/**
 * <ServedGraph> — one call as a picture: HELD · SERVED · WITHHELD.
 *
 * The Served tab's list is right for checking one row and wrong for seeing
 * that the system string was assembled from a base plus one skill body plus
 * two injections while three tools were withheld. That is one picture, and
 * this is it — the SAME row the list draws (`servedGraphAt`), arranged as
 * three bands and the edges between them. It holds no position: the tab hands
 * it a graph the ONE cursor already resolved.
 *
 * THE LAWS IT KEEPS (each is a test in `test/served/`):
 *   1. ONE CURSOR. Props in, nothing out. No state of its own at all.
 *   2. NO SENTENCE OF THE LENS'S OWN. Every explanation on screen is the
 *      library's own string — a gap's `why`, an ungapped sentence, a
 *      request-only line's `reason`, a withheld-list value — printed verbatim.
 *      The strings this file owns are LABELS ({@link GRAPH_LABELS}), and
 *      `test/served/no-own-claims.test.ts` walks it to keep it that way.
 *   3. A BADGE IS NEVER SOFTENED. The badge is `ServedBadge.tsx`'s, shared
 *      with the list: a Damaged row draws Damaged here too.
 *   4. ABSENT IS NOT NONE. A slot the rebuild produced nothing for draws its
 *      gaps and the receipt's own count beside the 0; a fold key with no
 *      committed value draws the Not-on-record badge, never an empty node.
 *   5. AUTHORITY OMISSIONS COME FROM THE FOLD. Hidden skills reach the
 *      withheld band with `from: 'fold'` — a receipt never names them.
 *
 * DRAWN WITH NO DEPENDENCY. Flex and CSS grid, three bands that wrap on a
 * narrow rail; every long value truncates with its full text on `title`, so
 * nothing is clipped and the rail never scrolls sideways.
 */

import React from 'react';

import type {
  CallNode,
  HeldNode,
  ServedEdge,
  ServedEdgeState,
  ServedGraph as ServedGraphData,
  ServedSlotName,
  SlotNode,
  WithheldNode,
} from '../../core/served/index.js';
import { T } from '../theme/index.js';
import { Badge } from './ServedBadge.js';

/**
 * Every string this view owns. Labels only — a name for a thing on screen,
 * never a sentence about the run.
 */
export const GRAPH_LABELS = Object.freeze({
  view: 'View',
  list: 'List',
  graph: 'Graph',
  held: 'Held',
  served: 'Served',
  withheld: 'Withheld',
  call: 'Call',
  epoch: 'epoch',
  commit: 'commit',
  model: 'model',
  provider: 'provider',
  runId: 'run id',
  cause: 'cause',
  covers: 'covers',
  from: 'from',
  rebuilt: 'rebuilt',
  receipt: 'receipt',
  onReceiptOnly: 'on receipt only',
  rebuiltOnly: 'rebuilt only',
  entered: 'entered',
  left: 'left',
  unchanged: 'unchanged',
  forced: 'forced',
  schemaChanged: 'schema changed',
  hiddenFromModel: 'hidden from the model',
  attentionDrops: 'attention drops',
  redacted: 'redacted',
  gap: 'gap',
  toolWithheld: 'withheld',
  count: 'count',
  hashes: 'hashes',
  fold: 'fold',
} as const);

/** The word for a withheld node's kind — the record's own vocabulary. */
const WITHHELD_LABELS: Readonly<Record<WithheldNode['kind'], string>> = Object.freeze({
  'tool-withheld': GRAPH_LABELS.toolWithheld,
  'attention-drop': GRAPH_LABELS.attentionDrops,
  'hidden-skill': GRAPH_LABELS.hiddenFromModel,
  redacted: GRAPH_LABELS.redacted,
  gap: GRAPH_LABELS.gap,
});

const STATE_LABELS: Readonly<Record<ServedEdgeState, string>> = Object.freeze({
  entered: GRAPH_LABELS.entered,
  left: GRAPH_LABELS.left,
  unchanged: GRAPH_LABELS.unchanged,
});

export interface ServedGraphProps {
  /** The three bands, as `servedGraphAt` built them from the cursor's row. */
  readonly graph: ServedGraphData;
}

export function ServedGraph({ graph }: ServedGraphProps): React.ReactElement {
  return (
    <div data-testid="served-graph" style={rootStyle}>
      <CallCard call={graph.call} />
      <div style={bandsStyle}>
        <Band title={GRAPH_LABELS.held} testId="graph-band-held">
          {graph.held.map((node) => (
            <HeldRow key={node.key} node={node} />
          ))}
        </Band>
        <Band title={GRAPH_LABELS.served} testId="graph-band-served">
          {graph.served.map((slot) => (
            <SlotCard
              key={slot.slot}
              slot={slot}
              edges={graph.edges.filter((e) => e.slot === slot.slot)}
              withheld={graph.withheld.filter((w) => w.slot === slot.slot)}
            />
          ))}
        </Band>
        <Band title={GRAPH_LABELS.withheld} testId="graph-band-withheld">
          {graph.withheld.map((node, i) => (
            <WithheldCard key={`${node.kind}:${node.name}:${i}`} node={node} />
          ))}
        </Band>
      </div>
    </div>
  );
}

// ─── the call ──────────────────────────────────────────────────────────

function CallCard({ call }: { call: CallNode }): React.ReactElement {
  return (
    <div style={callStyle} data-testid="graph-call" data-epoch={call.epoch}>
      <div style={rowStyle}>
        <span style={bandTitleStyle}>{GRAPH_LABELS.call}</span>
        <span style={chipStyle(T.primary)}>
          {GRAPH_LABELS.epoch} {call.epoch}
        </span>
        <span style={monoStyle}>{call.callRuntimeStageId}</span>
        <span style={mutedStyle}>
          {GRAPH_LABELS.commit} {call.commitIdx}
        </span>
        {call.damaged && <Badge check={{ status: 'damaged' }} />}
      </div>
      <div style={rowStyle} data-testid="graph-call-basis">
        {call.basis !== undefined ? (
          <>
            <span style={mutedStyle}>{GRAPH_LABELS.model}</span>
            <span style={monoStyle}>{call.basis.model}</span>
            <span style={mutedStyle}>{GRAPH_LABELS.provider}</span>
            <span style={monoStyle}>{call.basis.provider}</span>
            <span style={mutedStyle}>{GRAPH_LABELS.runId}</span>
            <span style={monoMutedStyle}>{call.basis.runId}</span>
          </>
        ) : (
          <>
            <span style={mutedStyle}>
              {GRAPH_LABELS.model} · {GRAPH_LABELS.provider}
            </span>
            <Badge check={{ status: call.basisStatus }} />
          </>
        )}
        {call.receiptCause !== undefined && (
          <span
            style={chipStyle(call.receiptCause === 'receipt-shape-rejected' ? T.error : T.textMuted)}
            data-testid="graph-call-cause"
          >
            {GRAPH_LABELS.cause} · {call.receiptCause}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── bands ─────────────────────────────────────────────────────────────

function Band({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section style={bandStyle} data-testid={testId} aria-label={title}>
      <div style={bandTitleStyle}>{title}</div>
      {children}
    </section>
  );
}

function HeldRow({ node }: { node: HeldNode }): React.ReactElement {
  const value = node.value === undefined ? undefined : safeJson(node.value);
  return (
    <div style={heldStyle} data-testid="graph-held" data-key={node.key} data-status={node.status}>
      <span style={keyStyle}>{node.key}</span>
      {value !== undefined ? (
        <span style={valueStyle} title={value}>
          {value}
        </span>
      ) : (
        // A key the record committed no value for: the badge IS the empty
        // state — an empty box would read as "nothing was there".
        <Badge check={{ status: node.status }} />
      )}
      {value !== undefined && node.status === 'damaged' && <Badge check={{ status: 'damaged' }} />}
    </div>
  );
}

// ─── the served band ───────────────────────────────────────────────────

/** Edges grouped by the node they leave, in wire order. A tool carries no
 *  origin (the record names none), so its group has no origin node. */
function groupByOrigin(
  edges: readonly ServedEdge[],
): readonly { readonly origin?: string; readonly edges: readonly ServedEdge[] }[] {
  const groups: { origin?: string; edges: ServedEdge[] }[] = [];
  for (const edge of edges) {
    let group = groups.find((g) => g.origin === edge.origin);
    if (group === undefined) {
      group = edge.origin !== undefined ? { origin: edge.origin, edges: [] } : { edges: [] };
      groups.push(group);
    }
    group.edges.push(edge);
  }
  return groups;
}

function SlotCard({
  slot,
  edges,
  withheld,
}: {
  slot: SlotNode;
  edges: readonly ServedEdge[];
  withheld: readonly WithheldNode[];
}): React.ReactElement {
  return (
    <div
      style={slotStyle}
      data-testid="graph-slot"
      data-slot={slot.slot}
      data-rebuilt={slot.rebuilt}
      data-receipt={slot.onReceipt}
      data-gapped={slot.gaps.length > 0 ? slot.gaps.map((g) => g.gap).join(' ') : undefined}
    >
      <div style={rowStyle}>
        <span style={slotNameStyle}>{slot.slot}</span>
        <span style={countStyle} data-testid="graph-slot-count">
          {GRAPH_LABELS.rebuilt} {slot.rebuilt}
          {slot.onReceipt !== undefined && ` · ${GRAPH_LABELS.receipt} ${slot.onReceipt}`}
        </span>
        {slot.check !== undefined && <Badge check={slot.check} />}
      </div>
      {slot.gaps.length > 0 && (
        <div style={chipsStyle}>
          {slot.gaps.map((gap) => (
            <span key={gap.gap} style={chipStyle(T.warning)} data-testid="graph-slot-gap" data-gap={gap.gap}>
              {gap.gap}
            </span>
          ))}
        </div>
      )}
      {groupByOrigin(edges).map((group, i) => (
        <div key={group.origin ?? `#${i}`} style={groupStyle}>
          {group.origin !== undefined && (
            <div style={originStyle} data-testid="graph-origin" data-origin={group.origin}>
              {group.origin}
            </div>
          )}
          {group.edges.map((edge) => (
            <EdgeRow key={edge.id} edge={edge} />
          ))}
        </div>
      ))}
      {withheld.map((node, i) => (
        <div
          key={`${node.kind}:${node.name}:${i}`}
          style={withheldEdgeStyle}
          data-testid="graph-withheld-edge"
          data-kind={node.kind}
          data-name={node.name}
          data-slot={slot.slot}
        >
          <Elbow />
          <span style={keyStyle}>{WITHHELD_LABELS[node.kind]}</span>
          <span style={monoMutedStyle}>{node.name}</span>
        </div>
      ))}
      {slot.onReceiptOnly > 0 && (
        <div style={countRowStyle} data-testid="graph-slot-on-receipt-only">
          <span style={keyStyle}>{GRAPH_LABELS.onReceiptOnly}</span>
          <span style={monoStyle}>{slot.onReceiptOnly}</span>
        </div>
      )}
      {slot.rebuiltOnly > 0 && (
        <div style={countRowStyle} data-testid="graph-slot-rebuilt-only">
          <span style={keyStyle}>{GRAPH_LABELS.rebuiltOnly}</span>
          <span style={monoStyle}>{slot.rebuiltOnly}</span>
        </div>
      )}
    </div>
  );
}

function EdgeRow({ edge }: { edge: ServedEdge }): React.ReactElement {
  const left = edge.state === 'left';
  const text = edge.text ?? '';
  return (
    <div
      style={left ? { ...edgeStyle, ...leftEdgeStyle } : edgeStyle}
      data-testid="graph-edge"
      data-edge={edge.id}
      data-kind={edge.kind}
      data-slot={edge.slot}
      data-origin={edge.origin}
      data-state={edge.state}
      data-status={edge.check.status}
    >
      <Elbow />
      {edge.label !== undefined && (
        <span style={monoStyle} data-testid="graph-edge-label">
          {edge.label}
        </span>
      )}
      {text !== '' && (
        <span style={valueStyle} title={text} data-testid="graph-edge-text">
          {text}
        </span>
      )}
      {edge.forced === true && <span style={chipStyle(T.warning)}>{GRAPH_LABELS.forced}</span>}
      {edge.schemaChanged === true && (
        <span style={chipStyle(T.warning)} data-testid="graph-edge-schema-changed">
          {GRAPH_LABELS.schemaChanged}
        </span>
      )}
      {edge.schemaOnReceiptOnly === true && (
        <span style={chipStyle(T.textMuted)} data-testid="graph-edge-schema-on-receipt">
          {GRAPH_LABELS.onReceiptOnly}
        </span>
      )}
      {edge.state !== undefined && (
        <span style={chipStyle(stateColor(edge.state))} data-testid="graph-edge-state">
          {STATE_LABELS[edge.state]}
        </span>
      )}
      <Badge check={edge.check} />
    </div>
  );
}

// ─── the withheld band ─────────────────────────────────────────────────

function WithheldCard({ node }: { node: WithheldNode }): React.ReactElement {
  return (
    <div
      style={withheldStyle}
      data-testid="graph-withheld"
      data-kind={node.kind}
      data-name={node.name}
      data-from={node.from}
      data-slot={node.slot}
    >
      <div style={rowStyle}>
        <span style={keyStyle}>{WITHHELD_LABELS[node.kind]}</span>
        <span style={monoStyle}>{node.name}</span>
        <span style={mutedStyle}>
          {GRAPH_LABELS.from} · {node.from}
        </span>
        {node.status !== undefined && <Badge check={{ status: node.status }} />}
      </div>
      {node.count !== undefined && (
        <div style={rowStyle} data-testid="graph-withheld-count">
          <span style={keyStyle}>{GRAPH_LABELS.count}</span>
          <span style={monoStyle}>{node.count}</span>
          {node.hashes !== undefined && (
            <span style={monoMutedStyle}>{node.hashes.join(' ')}</span>
          )}
        </div>
      )}
      {node.cause !== undefined && (
        <span
          style={chipStyle(node.cause === 'receipt-shape-rejected' ? T.error : T.textMuted)}
          data-testid="graph-withheld-cause"
        >
          {GRAPH_LABELS.cause} · {node.cause}
        </span>
      )}
      {node.fields !== undefined && (
        <div style={chipsStyle}>
          <span style={keyStyle}>{GRAPH_LABELS.covers}</span>
          {node.fields.map((field) => (
            <span key={field} style={fieldChipStyle}>
              {field}
            </span>
          ))}
        </div>
      )}
      {/* The library's own sentence, verbatim — this view writes none. */}
      {node.why !== undefined && (
        <p style={libraryStyle} data-testid="graph-withheld-why">
          {node.why}
        </p>
      )}
    </div>
  );
}

// ─── pieces ────────────────────────────────────────────────────────────

/** The connector into a slot: a drawn elbow, not a character. */
function Elbow(): React.ReactElement {
  return <span aria-hidden="true" style={elbowStyle} />;
}

function stateColor(state: ServedEdgeState): string {
  if (state === 'entered') return T.success;
  if (state === 'left') return T.error;
  return T.textMuted;
}

function safeJson(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// ─── styles ────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const bandsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: 8,
};
const bandStyle: React.CSSProperties = {
  flex: '1 1 220px',
  minWidth: 0,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '8px 10px',
  background: T.bgSecondary,
};
const bandTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: T.textMuted,
  marginBottom: 6,
};
const callStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '8px 10px',
  background: T.bgTertiary,
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  margin: '2px 0',
};
const heldStyle: React.CSSProperties = { ...rowStyle, borderTop: `1px dashed ${T.border}`, paddingTop: 3 };
const slotStyle: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: '6px 8px',
  marginBottom: 6,
  background: T.bgPrimary,
  minWidth: 0,
};
const slotNameStyle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 700,
  color: T.textPrimary,
};
const groupStyle: React.CSSProperties = { marginTop: 4, minWidth: 0 };
const originStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0 6px',
  borderRadius: 4,
  border: `1px solid ${T.primary}`,
  color: T.primary,
  fontFamily: T.fontMono,
  fontSize: 10,
};
const edgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  marginLeft: 8,
  padding: '1px 0',
};
const leftEdgeStyle: React.CSSProperties = {
  opacity: 0.7,
  textDecoration: 'line-through',
};
const withheldEdgeStyle: React.CSSProperties = {
  ...edgeStyle,
  opacity: 0.8,
  color: T.textMuted,
};
const elbowStyle: React.CSSProperties = {
  flex: 'none',
  width: 10,
  height: 8,
  borderLeft: `1px solid ${T.border}`,
  borderBottom: `1px solid ${T.border}`,
  borderBottomLeftRadius: 4,
  marginBottom: 4,
};
const withheldStyle: React.CSSProperties = {
  border: `1px dashed ${T.border}`,
  borderRadius: 6,
  padding: '6px 8px',
  marginBottom: 6,
  background: T.bgPrimary,
  minWidth: 0,
};
const chipsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, margin: '3px 0' };
const countRowStyle: React.CSSProperties = { ...rowStyle, marginLeft: 8 };
const countStyle: React.CSSProperties = { fontSize: 10.5, fontFamily: T.fontMono, color: T.textMuted };
const keyStyle: React.CSSProperties = { fontSize: 10.5, color: T.textMuted, flex: 'none' };
const valueStyle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  color: T.textPrimary,
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const monoStyle: React.CSSProperties = { fontFamily: T.fontMono, fontSize: 11, color: T.textPrimary };
const monoMutedStyle: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10.5,
  color: T.textMuted,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const mutedStyle: React.CSSProperties = { fontSize: 10.5, color: T.textMuted };
const fieldChipStyle: React.CSSProperties = {
  padding: '0 5px',
  borderRadius: 4,
  border: `1px solid ${T.border}`,
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.textSecondary,
};
const libraryStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 11,
  lineHeight: 1.45,
  color: T.textSecondary,
  borderLeft: `2px solid ${T.primary}`,
  paddingLeft: 8,
};
function chipStyle(color: string): React.CSSProperties {
  return {
    padding: '0 6px',
    borderRadius: 999,
    border: `1px solid ${color}`,
    color,
    fontSize: 10,
    fontFamily: T.fontMono,
    whiteSpace: 'nowrap',
  };
}
