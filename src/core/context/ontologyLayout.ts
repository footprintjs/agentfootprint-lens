import type { OntologyFold } from './ontology.js';

// ─── The layout ────────────────────────────────────────────────────────────

/** The geometry every chart shares — constants, so two renders agree byte for byte. */
export const GEOMETRY = Object.freeze({
  nodeWidth: 168,
  nodeHeight: 44,
  rowGap: 18,
  columnGap: 96,
  /** The lane each relation elbow takes to the right of the term columns, per edge. */
  laneGap: 14,
  padding: 12,
  labelOffset: 4,
});

export interface PlacedNode {
  readonly id: string;
  readonly kind: 'source' | 'term';
  readonly column: number;
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge {
  readonly kind: 'held' | 'relation';
  readonly from: string;
  readonly to: string;
  /** The SVG path, straight for a holding, an elbow for a relation. */
  readonly path: string;
  /** Where the label sits. */
  readonly labelX: number;
  readonly labelY: number;
  /** The `via` names for a holding; the relation word for a relation. */
  readonly label: string;
  readonly relation?: string;
}

export interface OntologyLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  /** The x of the unheld column's heading, when the column is drawn. */
  readonly unheldX?: number;
}

export const columnX = (column: number): number => GEOMETRY.padding + column * (GEOMETRY.nodeWidth + GEOMETRY.columnGap);
const rowY = (row: number): number => GEOMETRY.padding + GEOMETRY.nodeHeight + row * (GEOMETRY.nodeHeight + GEOMETRY.rowGap);
const centreY = (n: PlacedNode): number => n.y + GEOMETRY.nodeHeight / 2;

/**
 * Place the fold: sources in column 0, held terms in column 1, unheld terms in
 * column 2 (when any); rows by sorted index. A holding is a straight line from
 * the source's right edge to the term's left edge; a relation is an elbow out
 * of `from`'s right edge into a lane right of the term columns and back into
 * `to`'s right edge — one lane per relation, in declaration order. Pure.
 */
export function layoutOntology(fold: OntologyFold): OntologyLayout {
  const heldTerms = fold.terms.filter((t) => t.held.length > 0);
  const unheldTerms = fold.terms.filter((t) => t.held.length === 0);
  const nodes: PlacedNode[] = [
    ...fold.sources.map((s, i) => ({ id: s.id, kind: 'source' as const, column: 0, x: columnX(0), y: rowY(i) })),
    ...heldTerms.map((t, i) => ({ id: t.id, kind: 'term' as const, column: 1, x: columnX(1), y: rowY(i) })),
    ...unheldTerms.map((t, i) => ({ id: t.id, kind: 'term' as const, column: 2, x: columnX(2), y: rowY(i) })),
  ];
  const at = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n]));
  const columns = unheldTerms.length > 0 ? 3 : heldTerms.length > 0 ? 2 : 1;
  const rightEdge = columnX(columns - 1) + GEOMETRY.nodeWidth;
  const edges: PlacedEdge[] = [];
  for (const h of fold.held) {
    const from = at.get(`source:${h.source}`);
    const to = at.get(`term:${h.node}`);
    if (from === undefined || to === undefined) continue;
    const x1 = from.x + GEOMETRY.nodeWidth;
    const y1 = centreY(from);
    const x2 = to.x;
    const y2 = centreY(to);
    edges.push({
      kind: 'held',
      from: h.source,
      to: h.node,
      path: `M ${x1} ${y1} L ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - GEOMETRY.labelOffset,
      label: h.via.join(', '),
    });
  }
  fold.relations.forEach((r, i) => {
    const from = at.get(`term:${r.from}`);
    const to = at.get(`term:${r.to}`);
    if (from === undefined || to === undefined) return;
    const lane = rightEdge + GEOMETRY.laneGap * (i + 1);
    const x1 = from.x + GEOMETRY.nodeWidth;
    const y1 = centreY(from);
    const x2 = to.x + GEOMETRY.nodeWidth;
    const y2 = centreY(to);
    edges.push({
      kind: 'relation',
      from: r.from,
      to: r.to,
      path: `M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`,
      labelX: lane + GEOMETRY.labelOffset,
      labelY: (y1 + y2) / 2,
      label: r.relation,
      relation: r.relation,
    });
  });
  const rows = Math.max(fold.sources.length, heldTerms.length, unheldTerms.length, 1);
  const lanes = fold.relations.length;
  return Object.freeze({
    width: rightEdge + GEOMETRY.laneGap * (lanes + 1) + GEOMETRY.padding + 120,
    height: rowY(rows) + GEOMETRY.padding,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    ...(unheldTerms.length > 0 ? { unheldX: columnX(2) } : {}),
  });
}
