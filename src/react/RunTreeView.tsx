/**
 * RunTreeView — recursive expandable tree of RunTreeNodes.
 *
 * Pattern: recursive component (each node renders itself + children).
 * Role:    Primary structural view of the engineer mode. Each node shows
 *          kind icon + label + status + duration. Leaves (LLM / tool /
 *          pause) don't expand; composition + iteration nodes do.
 */

import React, { useState } from 'react';
import type { RunTreeNode } from '../core/types.js';
import { T } from './theme/index.js';

interface RunTreeViewProps {
  readonly node: RunTreeNode;
  /** Callback when user clicks a node — fires with the full node. */
  readonly onSelect?: (node: RunTreeNode) => void;
  /** Currently-selected node id (for highlight). */
  readonly selectedId?: string;
  /** Recursion depth for indent. Internal — leave undefined at call sites. */
  readonly depth?: number;
}

/** Render a node + its children. Top-level consumers pass the tree root. */
export const RunTreeView: React.FC<RunTreeViewProps> = ({
  node,
  onSelect,
  selectedId,
  depth = 0,
}) => {
  const hasChildren = node.children.length > 0;
  // Auto-expand down to iteration depth so LLM / tool leaves are
  // visible without a click on initial render. Consumers can still
  // collapse by clicking the caret.
  const [expanded, setExpanded] = useState(depth < 3 && hasChildren);
  const isSelected = node.id === selectedId;

  return (
    <div style={{ fontFamily: T.fontMono, fontSize: 13, lineHeight: 1.5 }}>
      <div
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect?.(node);
        }}
        style={{
          paddingLeft: depth * 16,
          cursor: hasChildren || onSelect ? 'pointer' : 'default',
          background: isSelected ? T.bgTertiary : 'transparent',
          borderLeft: isSelected ? `3px solid ${T.primary}` : '3px solid transparent',
          padding: '2px 4px 2px 6px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
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
      {expanded &&
        node.children.map((child) => (
          <RunTreeView
            key={child.id}
            node={child}
            onSelect={onSelect}
            selectedId={selectedId}
            depth={depth + 1}
          />
        ))}
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
