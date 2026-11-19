import type { ProofFold } from './proofMap.js';

export const overlayLabels = Object.freeze({ contingent: 'contingent', conflict: 'conflict' });

// ─── The layout ────────────────────────────────────────────────────────────

/** The geometry every map shares — constants, so two renders agree byte for byte. */
export const GEOMETRY = Object.freeze({
  nodeWidth: 168,
  nodeHeight: 44,
  rowGap: 18,
  columnGap: 96,
  /** The lane each overlay edge takes in the gutter left of the calls column. */
  laneGap: 10,
  /** How far below a node's centre an overlay edge attaches, so it never rides a straight edge. */
  laneOffset: 8,
  padding: 12,
  labelOffset: 4,
});

export type ProofNodeKind = 'answer' | 'call' | 'tool' | 'source';
export type ProofEdgeKind = 'stands-on' | 'calls' | 'reads' | 'contingent' | 'conflict';

export interface PlacedNode {
  readonly id: string;
  readonly kind: ProofNodeKind;
  readonly column: number;
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge {
  readonly kind: ProofEdgeKind;
  /** `<kind>:<id>` of each end. */
  readonly from: string;
  readonly to: string;
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /** A standing word, or a label with the carrier's standing; empty when the edge carries none. */
  readonly label: string;
  /** The whole value the edge stands for (a contingent value, a conflict key). */
  readonly title?: string;
}

export interface ProofLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  /** The x of each drawn column's heading, by node kind. */
  readonly columns: Readonly<Partial<Record<ProofNodeKind, number>>>;
}

export const proofNodeKey = (kind: ProofNodeKind, id: string): string => `${kind}:${id}`;
const rowY = (row: number): number => GEOMETRY.padding + GEOMETRY.nodeHeight + row * (GEOMETRY.nodeHeight + GEOMETRY.rowGap);
const centreY = (n: PlacedNode): number => n.y + GEOMETRY.nodeHeight / 2;
const right = (n: PlacedNode): number => n.x + GEOMETRY.nodeWidth;

interface Overlay {
  readonly kind: 'contingent' | 'conflict';
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly title: string;
}

/** Every overlay edge in row order: one per contingent carrier, one per witness pair of a conflict. */
function overlaysOf(fold: ProofFold): Overlay[] {
  const out: Overlay[] = [];
  for (const c of fold.contingent) {
    const from = c.declaredOn === 'answer' ? proofNodeKey('answer', 'answer') : proofNodeKey('call', c.declaredOn.toolCallId);
    for (const carrier of c.carriers) {
      out.push({ kind: 'contingent', from, to: proofNodeKey('call', carrier.toolCallId), label: `${overlayLabels.contingent} · ${carrier.standing}`, title: c.value });
    }
  }
  for (const c of fold.findings.conflicts) {
    for (let i = 0; i < c.witnesses.length; i++) {
      for (let j = i + 1; j < c.witnesses.length; j++) {
        out.push({ kind: 'conflict', from: proofNodeKey('call', c.witnesses[i]!.toolCallId), to: proofNodeKey('call', c.witnesses[j]!.toolCallId), label: overlayLabels.conflict, title: c.key });
      }
    }
  }
  return out;
}

/** A straight edge from `from`'s right edge to `to`'s left edge. */
function straight(kind: ProofEdgeKind, from: PlacedNode, to: PlacedNode, label: string): PlacedEdge {
  const x1 = right(from);
  const y1 = centreY(from);
  const x2 = to.x;
  const y2 = centreY(to);
  return { kind, from: proofNodeKey(from.kind, from.id), to: proofNodeKey(to.kind, to.id), path: `M ${x1} ${y1} L ${x2} ${y2}`, labelX: (x1 + x2) / 2, labelY: (y1 + y2) / 2 - GEOMETRY.labelOffset, label };
}

/**
 * An overlay edge through its own lane in the gutter left of the calls
 * column: out of `from`'s right edge (the answer) or left edge (a call), into
 * the lane, down or up to the target's row, into `to`'s left edge — attached
 * below the centre so it never rides a `stands on` line.
 */
function laned(o: Overlay, from: PlacedNode, to: PlacedNode, lane: number): PlacedEdge {
  const y1 = centreY(from) + GEOMETRY.laneOffset;
  const y2 = centreY(to) + GEOMETRY.laneOffset;
  const x1 = from.kind === 'answer' ? right(from) : from.x;
  const x2 = to.x;
  return {
    kind: o.kind,
    from: o.from,
    to: o.to,
    path: `M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`,
    labelX: lane + GEOMETRY.labelOffset,
    labelY: (y1 + y2) / 2,
    label: o.label,
    title: o.title,
  };
}

/**
 * Place the fold: the answer (when present) in the first column, the calls
 * next, the tools next, the sources last (when a map was declared); rows by
 * index. Straight edges for `stands on`, `calls` and `reads`; one lane per
 * overlay edge in row order, in the gutter left of the calls column. Pure.
 */
export function layoutProofMap(fold: ProofFold): ProofLayout {
  const overlays = overlaysOf(fold);
  const lanes = overlays.length;
  const gutter = lanes > 0 ? Math.max(GEOMETRY.columnGap, GEOMETRY.laneGap * (lanes + 1) + GEOMETRY.padding) : GEOMETRY.columnGap;
  const answerX = fold.answer !== undefined ? GEOMETRY.padding : undefined;
  const callsX = answerX !== undefined ? answerX + GEOMETRY.nodeWidth + gutter : GEOMETRY.padding + (lanes > 0 ? GEOMETRY.laneGap * (lanes + 1) : 0);
  const toolsX = callsX + GEOMETRY.nodeWidth + GEOMETRY.columnGap;
  const sourcesX = fold.sources !== undefined ? toolsX + GEOMETRY.nodeWidth + GEOMETRY.columnGap : undefined;
  const nodes: PlacedNode[] = [];
  if (answerX !== undefined) nodes.push({ id: 'answer', kind: 'answer', column: 0, x: answerX, y: rowY(0) });
  const base = answerX !== undefined ? 1 : 0;
  fold.calls.forEach((c, i) => nodes.push({ id: c.toolCallId, kind: 'call', column: base, x: callsX, y: rowY(i) }));
  fold.tools.forEach((t, i) => nodes.push({ id: t, kind: 'tool', column: base + 1, x: toolsX, y: rowY(i) }));
  if (sourcesX !== undefined) (fold.sources ?? []).forEach((s, i) => nodes.push({ id: s.id, kind: 'source', column: base + 2, x: sourcesX, y: rowY(i) }));
  const at = new Map(nodes.map((n) => [proofNodeKey(n.kind, n.id), n]));
  const edges: PlacedEdge[] = [];
  const answer = at.get(proofNodeKey('answer', 'answer'));
  for (const s of fold.answer?.standsOn ?? []) {
    const to = at.get(proofNodeKey('call', s.toolCallId));
    if (answer !== undefined && to !== undefined) edges.push(straight('stands-on', answer, to, s.standing));
  }
  for (const c of fold.calls) {
    const from = at.get(proofNodeKey('call', c.toolCallId));
    const to = c.toolName !== undefined ? at.get(proofNodeKey('tool', c.toolName)) : undefined;
    if (from !== undefined && to !== undefined) edges.push(straight('calls', from, to, ''));
  }
  for (const s of fold.sources ?? []) {
    const to = at.get(proofNodeKey('source', s.id));
    for (const t of s.tools) {
      const from = at.get(proofNodeKey('tool', t));
      if (from !== undefined && to !== undefined) edges.push(straight('reads', from, to, ''));
    }
  }
  overlays.forEach((o, i) => {
    const from = at.get(o.from);
    const to = at.get(o.to);
    if (from !== undefined && to !== undefined) edges.push(laned(o, from, to, callsX - GEOMETRY.laneGap * (i + 1)));
  });
  const rows = Math.max(fold.calls.length, fold.tools.length, fold.sources?.length ?? 0, 1);
  const rightEdge = (sourcesX ?? toolsX) + GEOMETRY.nodeWidth;
  return Object.freeze({
    width: rightEdge + GEOMETRY.padding,
    height: rowY(rows) + GEOMETRY.padding,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    columns: Object.freeze({
      ...(answerX !== undefined ? { answer: answerX } : {}),
      call: callsX,
      tool: toolsX,
      ...(sourcesX !== undefined ? { source: sourcesX } : {}),
    }),
  });
}
