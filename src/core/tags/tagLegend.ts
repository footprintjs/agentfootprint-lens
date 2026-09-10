/**
 * The tag legend — what a chart CAN produce, and what a run DID hit.
 *
 * footprintjs 9.21 lets an author put NAMES on a stage at build time
 * (`.tag(...)` / `options.tags`); the Map (the recording's `structure`) carries
 * them as-is on the spec node, and the engine stamps them on the stage's
 * commit bundle (`CommitBundle.tags`). Law 6 of the design: the Map advertises
 * the vocabulary, the Trace shows which a run hit — so a lens draws its legend
 * before the run exists.
 *
 * Two readers, kept apart on purpose:
 *   · DECLARED — a walk over the structure (`next` / `children` /
 *     `subflowStructure`, the same walk `extractAgentLegend` does). `undefined`
 *     when the recording carried no structure — absent, not empty, and the
 *     UI says which.
 *   · HIT — every `tags` array on every bundle of the run's log and of each
 *     mounted subflow's own log, counted.
 *
 * agentfootprint's milestone vocabulary (`'milestone:<kind>'` beside a
 * `'milestone-label:<label>'` carrier) is read back through its own
 * `milestoneFromTags` when the installed peer has it, so a milestone tag
 * prints the label the chart declared; any other tag prints its raw name.
 * `milestoneFromTags` is read off the module namespace at call time — the peer
 * range admits agentfootprint 7 and 8, which have no such symbol.
 */

import * as agentfootprint from 'agentfootprint';

import { mountLogsOf } from '../utils/snapshotOfRunner.js';

/**
 * The carrier prefix agentfootprint pairs with a milestone kind tag
 * (`conventions.ts · MILESTONE_LABEL_TAG_PREFIX`). A carrier is not a stop
 * of its own — it names its sibling — so the legend folds it into the kind
 * tag's label instead of listing it.
 */
const MILESTONE_LABEL_CARRIER = 'milestone-label:';

type MilestoneFromTags = (
  tags: readonly unknown[] | undefined,
  labelWhenUndeclared?: string,
) => { readonly kind: string; readonly label: string } | null;

/** agentfootprint 9.90's reader, when the installed peer ships it. */
function milestoneReader(): MilestoneFromTags | undefined {
  const fn = (agentfootprint as { milestoneFromTags?: unknown }).milestoneFromTags;
  return typeof fn === 'function' ? (fn as MilestoneFromTags) : undefined;
}

/** One tag the legend lists. */
export interface TagLegendEntry {
  /** The tag, verbatim — what a picker hands to `tagStops`. */
  readonly name: string;
  /** What to print: the milestone label when the tag is one, else `name`. */
  readonly label: string;
  /** Listed by the chart's structure. `false` when the structure does not
   *  name it (or did not travel). */
  readonly declared: boolean;
  /** How many bundles of this run carry it, root log and mount logs
   *  together. `0` = declared but never hit. */
  readonly hits: number;
  /**
   * The share of `hits` on the RUN'S OWN log — the only log `tagStops` reads,
   * so the only hits a pick can scrub to. `0` with `mountHits > 0` is a tag
   * hit only inside mounted subflows: real, but not a stop on the root axis.
   */
  readonly rootHits: number;
  /** The share of `hits` inside mounted subflows' own logs (one per mount). */
  readonly mountHits: number;
  /** agentfootprint's milestone kind, when the tag is one. */
  readonly milestone?: string;
}

export interface TagLegend {
  /** `'structure'` when the chart travelled with the recording, else
   *  `'log'` — the legend then lists only tags the run hit. */
  readonly source: 'structure' | 'log';
  readonly entries: readonly TagLegendEntry[];
}

/**
 * The label `milestoneFromTags` would give the whole array a tag sits in —
 * so a kind tag borrows its sibling carrier's label.
 */
function labelFor(name: string, siblings: readonly string[]): { label: string; milestone?: string } {
  const read = milestoneReader();
  const m = read?.(siblings.includes(name) ? siblings : [name, ...siblings]);
  if (m && `milestone:${m.kind}` === name) return { label: m.label, milestone: m.kind };
  return { label: name };
}

const strings = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];

interface SpecLike {
  readonly tags?: unknown;
  readonly next?: SpecLike;
  readonly children?: readonly SpecLike[];
  readonly subflowStructure?: SpecLike;
}

/** Every `tags` array on the Map, with the array each tag sat in. */
export function declaredTagsOf(structure: unknown): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  const visited = new Set<object>();
  const walk = (node: SpecLike | undefined): void => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    const tags = strings(node.tags);
    for (const t of tags) if (!out.has(t)) out.set(t, tags);
    walk(node.next);
    if (Array.isArray(node.children)) for (const c of node.children) walk(c);
    walk(node.subflowStructure);
  };
  walk(structure as SpecLike | undefined);
  return out;
}

/** One tag's hits, root and mount logs apart, with the array it first sat in. */
export interface TagHits {
  root: number;
  mount: number;
  siblings: readonly string[];
}

/**
 * Every `tags` array on every bundle — the run's own log, and each mount's own
 * log ONCE (`mountLogsOf` walks the `#n`-keyed half of the dual-keyed
 * `subflowResults`; the bare-keyed twins would double every count).
 */
export function hitTagsOf(snapshot: unknown): Map<string, TagHits> {
  const out = new Map<string, TagHits>();
  const addFrom = (log: unknown, where: 'root' | 'mount'): void => {
    if (!Array.isArray(log)) return;
    for (const bundle of log) {
      const tags = strings((bundle as { tags?: unknown } | null)?.tags);
      for (const t of tags) {
        const entry = out.get(t) ?? { root: 0, mount: 0, siblings: tags };
        entry[where] += 1;
        out.set(t, entry);
      }
    }
  };
  const s = snapshot as { commitLog?: unknown } | null | undefined;
  if (s === null || typeof s !== 'object') return out;
  addFrom(s.commitLog, 'root');
  for (const mount of mountLogsOf(snapshot)) addFrom(mount.log, 'mount');
  return out;
}

/**
 * The legend for one recording.
 *
 * @param structure the recording's `structure` (`runner.getSpec().buildTimeStructure`), or `undefined`
 * @param snapshot  the run's snapshot (`runner.getLastSnapshot()`)
 *
 * @example
 * ```ts
 * const legend = tagLegend(recording.structure, snapshot);
 * legend.source;                          // 'structure'
 * legend.entries.map((e) => e.label);     // ['Iteration', 'LLM turn', 'Tool call', 'audit']
 * ```
 */
export function tagLegend(structure: unknown, snapshot: unknown): TagLegend {
  const declared = structure === undefined || structure === null ? undefined : declaredTagsOf(structure);
  const hit = hitTagsOf(snapshot);
  const names = new Set<string>([...(declared?.keys() ?? []), ...hit.keys()]);
  const entries: TagLegendEntry[] = [];
  for (const name of names) {
    if (name.startsWith(MILESTONE_LABEL_CARRIER)) continue;
    const hits = hit.get(name);
    const siblings = hits?.siblings ?? declared?.get(name) ?? [name];
    const { label, milestone } = labelFor(name, siblings);
    const rootHits = hits?.root ?? 0;
    const mountHits = hits?.mount ?? 0;
    entries.push({
      name,
      label,
      declared: declared?.has(name) ?? false,
      hits: rootHits + mountHits,
      rootHits,
      mountHits,
      ...(milestone !== undefined ? { milestone } : {}),
    });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  return { source: declared === undefined ? 'log' : 'structure', entries };
}
