/**
 * isFrameworkChartNode — the reserved-segment law, applied to a chart node.
 *
 * agentfootprint reserves the `sf-` subflow-id prefix for its OWN composition
 * segments (`RESERVED_SUBFLOW_PREFIX` / `isReservedSubflowSegment`, exported
 * from the conventions surface since 9.49): every reader downstream tells
 * LIBRARY PLUMBING from CONSUMER STRUCTURE by that prefix and nothing else.
 * This lens IS the agentfootprint consumer, so it is the layer allowed to
 * spell that law — `footprint-explainable-ui` stays generic and receives only
 * a predicate (`collapseTraceGraph` / `<TracedFlow collapseNode>`).
 *
 * One deliberate exception, and it is the lens's own judgement, not the
 * law's: a node this package's OWN graph builder marked `emphasis: 'hero'`
 * stays. The context slots (`sf-system-prompt` / `sf-messages` / `sf-tools`)
 * are reserved segments AND the heroes of the grouped reading — watching the
 * context engineering is the one thing the Why Lens exists for, so hiding
 * them as "plumbing" would contradict the classification this package already
 * made when it built the chart (`structureGraphFromRunner` muted the
 * machinery and spotlighted the slots).
 *
 * What that leaves hidden on a standard agent chart: the Injection Engine,
 * the cache machinery, thinking normalization, the ReAct router — the stages
 * a person debugging THEIR agent did not write and did not mount.
 */

// Namespace import + call-time access (the house TRUE-ESM pattern): a NAMED
// import of `isReservedSubflowSegment` would crash at module load on every
// agentfootprint older than 9.49 — inside this package's declared peer range.
// The law itself predates the export (the prefix has been reserved all
// along); on an older peer the same law is spelled here.
import * as agentfootprint from 'agentfootprint';

const RESERVED_PREFIX = 'sf-';

function isReservedSegment(segment: string): boolean {
  const fromLibrary = (
    agentfootprint as { isReservedSubflowSegment?: (segment: string) => boolean }
  ).isReservedSubflowSegment;
  return fromLibrary !== undefined ? fromLibrary(segment) : segment.startsWith(RESERVED_PREFIX);
}

/** The two fields the judgement reads — structural, so a `TraceNode`, a plain
 *  `{ id, data }`, or a test fixture all fit without a cast. */
export interface ChartNodeLike {
  readonly id: string;
  readonly data?: { readonly emphasis?: string } | undefined;
}

/** The LAST path segment of a chart node id (`a/b/sf-x` → `sf-x`) — the
 *  segment the node itself IS; ancestors' reservedness is their own nodes'. */
function lastSegment(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

/**
 * True when this chart node is agentfootprint plumbing the grouped reading
 * hides by default: its own segment is reserved (`sf-*`) and the lens's graph
 * builder did not mark it a hero.
 */
export function isFrameworkChartNode(node: ChartNodeLike): boolean {
  if (!isReservedSegment(lastSegment(node.id))) return false;
  return node.data?.emphasis !== 'hero';
}
