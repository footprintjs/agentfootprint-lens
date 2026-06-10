/**
 * RunTreeView — expandable tree of RunTreeNodes.
 *
 * Pattern: flatten-then-window. The tree is flattened to its VISIBLE
 *          rows (respecting expand/collapse) each render; past
 *          `virtualizeThreshold` rows only the scrolled-to window is
 *          mounted (U3 — the recursive-render version degraded beyond
 *          ~500 nodes because every visible node was a live component).
 * Role:    Primary structural view of the engineer mode. Each node shows
 *          kind icon + label + status + duration. Leaves (LLM / tool /
 *          pause) don't expand; composition + iteration nodes do.
 *
 * Expansion state is a node-id keyed override map: nodes default to
 * expanded at depth < 3 (so LLM / tool leaves are visible without a
 * click), and a click toggles the override. Because the default is
 * DERIVED per render, a shallow node that gains children mid-run now
 * auto-expands (the old mount-time `useState` initial froze it closed).
 */

import React, { useMemo, useState } from 'react';
import type { RunTreeNode } from '../core/types.js';
import { useWindowedList } from './hooks/useWindowedList.js';
import { T } from './theme/index.js';

interface RunTreeViewProps {
  readonly node: RunTreeNode;
  /** Callback when user clicks a node — fires with the full node. */
  readonly onSelect?: (node: RunTreeNode) => void;
  /** Currently-selected node id (for highlight). */
  readonly selectedId?: string;
  /** Starting indent depth. Internal — leave undefined at call sites. */
  readonly depth?: number;
  /** Visible-row count past which windowed rendering engages (inside a
   *  `maxHeight` scroll container). Default 300. Below it the tree
   *  renders every visible row with no scroll wrapper — unchanged
   *  layout for typical runs. */
  readonly virtualizeThreshold?: number;
  /** Fixed row height (px) used when windowing is active. Default 26. */
  readonly rowHeight?: number;
  /** Scroll-container height (px) used when windowing is active.
   *  Default 480. */
  readonly maxHeight?: number;
}

/** One visible row of the flattened tree. */
interface FlatRow {
  readonly node: RunTreeNode;
  readonly depth: number;
  readonly expanded: boolean;
  /** Ancestor-path key (`root/iter-1/llm-0`). Node ids are only unique
   *  among SIBLINGS (e.g. `agent-iter:0` repeats across turns) — the
   *  same constraint the old recursive renderer's per-level React keys
   *  relied on — so the flat list keys rows (and the expansion map) by
   *  path, reproducing the old per-position behavior exactly. */
  readonly pathKey: string;
}

/** Default expansion — matches the original recursive component: open
 *  down to iteration depth so leaves show without a click. */
function defaultExpanded(node: RunTreeNode, depth: number): boolean {
  return depth < 3 && node.children.length > 0;
}

/** Flatten the VISIBLE portion of the tree (children of collapsed nodes
 *  are skipped) into render rows. */
function flattenVisible(
  root: RunTreeNode,
  baseDepth: number,
  overrides: ReadonlyMap<string, boolean>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (node: RunTreeNode, depth: number, parentPath: string): void => {
    const pathKey = parentPath === '' ? node.id : `${parentPath}/${node.id}`;
    const expanded = overrides.get(pathKey) ?? defaultExpanded(node, depth);
    rows.push({ node, depth, expanded, pathKey });
    if (expanded) for (const child of node.children) walk(child, depth + 1, pathKey);
  };
  walk(root, baseDepth, '');
  return rows;
}

/** Render a node + its children. Top-level consumers pass the tree root. */
export const RunTreeView: React.FC<RunTreeViewProps> = ({
  node,
  onSelect,
  selectedId,
  depth = 0,
  virtualizeThreshold = 300,
  rowHeight = 26,
  maxHeight = 480,
}) => {
  // Expand/collapse overrides keyed by the row's ancestor PATH —
  // survives the fresh RunTreeNode objects each `selectRunTree()`
  // snapshot produces (same persistence the old per-node `useState`
  // got from React keys, which were likewise sibling-scoped).
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());

  const rows = useMemo(
    () => flattenVisible(node, depth, overrides),
    [node, depth, overrides],
  );

  const w = useWindowedList({
    count: rows.length,
    rowHeight,
    threshold: virtualizeThreshold,
  });

  const toggle = (row: FlatRow): void => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(row.pathKey, !row.expanded);
      return next;
    });
  };

  const body = (
    <>
      {w.topPad > 0 && <div style={{ height: w.topPad }} aria-hidden />}
      {rows.slice(w.start, w.end).map((row) => (
        <RunTreeRow
          key={row.pathKey}
          row={row}
          selected={row.node.id === selectedId}
          {...(w.windowed ? { fixedHeight: rowHeight } : {})}
          onClick={() => {
            if (row.node.children.length > 0) toggle(row);
            onSelect?.(row.node);
          }}
          clickable={row.node.children.length > 0 || onSelect !== undefined}
        />
      ))}
      {w.bottomPad > 0 && <div style={{ height: w.bottomPad }} aria-hidden />}
    </>
  );

  return (
    <div style={{ fontFamily: T.fontMono, fontSize: 13, lineHeight: 1.5 }}>
      {w.windowed ? (
        // Windowing needs a scroll container with a bounded height —
        // engaged only past the threshold, where an unbounded tree
        // wouldn't be usable anyway.
        <div style={{ maxHeight, overflowY: 'auto' }} onScroll={w.onScroll}>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
};

/** One row — markup identical to the original recursive node header. */
const RunTreeRow: React.FC<{
  row: FlatRow;
  selected: boolean;
  clickable: boolean;
  onClick: () => void;
  /** Set when windowing is active — pins the row to the hook's geometry. */
  fixedHeight?: number;
}> = ({ row, selected, clickable, onClick, fixedHeight }) => {
  const { node, depth, expanded } = row;
  const hasChildren = node.children.length > 0;
  return (
    <div
      onClick={onClick}
      style={{
        cursor: clickable ? 'pointer' : 'default',
        background: selected ? T.bgTertiary : 'transparent',
        borderLeft: selected ? `3px solid ${T.primary}` : '3px solid transparent',
        // Longhands only — the original mixed `paddingLeft: depth * 16`
        // with a later `padding` SHORTHAND, which silently reset the
        // indent to 6px (and React warns on shorthand/longhand mixes).
        paddingTop: 2,
        paddingRight: 4,
        paddingBottom: 2,
        paddingLeft: depth * 16 + 6,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        ...(fixedHeight !== undefined
          ? {
              height: fixedHeight,
              boxSizing: 'border-box',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }
          : {}),
      }}
    >
      <span style={{ opacity: 0.5, width: 12, display: 'inline-block' }}>
        {hasChildren ? (expanded ? '▾' : '▸') : '·'}
      </span>
      <span>{kindGlyph(node.kind)}</span>
      <span style={{ fontWeight: node.kind === 'run' ? 600 : 400 }}>{node.label}</span>
      <span
        style={{
          marginLeft: 'auto',
          opacity: 0.6,
          fontSize: 11,
        }}
      >
        {statusGlyph(node.status)}
        {node.durationMs !== undefined ? `  ${formatMs(node.durationMs)}` : ''}
      </span>
    </div>
  );
};

function kindGlyph(kind: RunTreeNode['kind']): string {
  switch (kind) {
    case 'run':
      return '▶';
    case 'composition':
      return '⋈';
    case 'iteration':
      return '↻';
    case 'llm-call':
      return '🅛';
    case 'tool-call':
      return '🛠';
    case 'fork-branch':
      return '⋔';
    case 'decision-branch':
      return '↳';
    case 'pause':
      return '⏸';
  }
}

function statusGlyph(status: RunTreeNode['status']): string {
  switch (status) {
    case 'running':
      return '…';
    case 'ok':
      return '✓';
    case 'err':
      return '✗';
    case 'paused':
      return '⏸';
    case 'budget_exhausted':
      return '⚠';
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
