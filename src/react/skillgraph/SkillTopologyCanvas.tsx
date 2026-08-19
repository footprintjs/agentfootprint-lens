/**
 * <SkillTopologyCanvas> — the skill graph with the run's cursor on it.
 *
 * Draws what {@link selectSkillTopology} resolved and decides nothing itself:
 * node states, edge origins and the active hop all arrive computed. Two things
 * it is careful about, because both are places a debugger can lie:
 *
 *   DECLARED vs OBSERVED — an author's edge and a hop the model took are
 *   drawn differently and named in the legend. An observed edge with no
 *   declared twin is the finding, not a rendering detail.
 *
 *   PARTIAL DECLARATIONS — when the declared set came from the recording, it
 *   is a lower bound (an edge is named once it fires), and the canvas says so
 *   under the legend rather than implying the author drew only what ran.
 *
 * Clicking a node FILTERS THE ONE CURSOR to that skill's next span. It never
 * holds a selection of its own — what is highlighted is a function of the
 * cursor, so the canvas and the strip cannot disagree.
 */

import React, { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { SkillNodeState, SkillTopology } from '../../core/selectors/selectSkillTopology.js';
import { T } from '../theme/index.js';
import { skillTopologyPositions } from './skillTopologyPositions.js';
import type { SkillLens } from './lens.js';

/** Per-state paint + the two legends. Product wording is the SAME state, said
 *  for a reader who has never seen a cursor — never a different state. */
const STATE_STYLE: Record<
  SkillNodeState,
  { color: string; developer: string; product: string; dim: number }
> = {
  current: { color: T.primary, developer: 'current', product: 'reading now', dim: 1 },
  refused: { color: T.error, developer: 'refused here', product: 'asked for, not allowed', dim: 1 },
  reachable: { color: T.srcSkill, developer: 'reachable', product: 'can open next', dim: 1 },
  visited: { color: T.textSecondary, developer: 'visited', product: 'already read', dim: 0.92 },
  idle: { color: T.textMuted, developer: 'not entered', product: 'not opened', dim: 0.55 },
};

const HANDLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none',
};

interface SkillNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly state: SkillNodeState;
  readonly stateLabel: string;
  readonly pickedByModel: boolean;
  readonly jumpable: boolean;
}

const SkillStateNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as SkillNodeData;
  const paint = STATE_STYLE[d.state];
  const isCurrent = d.state === 'current';
  return (
    <div
      data-testid={`skill-node-${d.label}`}
      data-state={d.state}
      title={d.jumpable ? `Jump the cursor to "${d.label}"` : `The cursor never stood in "${d.label}"`}
      style={{
        width: 192,
        minHeight: 56,
        padding: '8px 10px',
        borderRadius: 10,
        boxSizing: 'border-box',
        background: isCurrent ? T.bgTertiary : T.bgSecondary,
        // Longhand, never the `border` shorthand: React warns (and browsers
        // disagree) when a shorthand and one of its longhands are both set,
        // and this node sets `borderStyle` on its own for the reachable state.
        borderWidth: isCurrent ? 2 : 1,
        borderStyle: d.state === 'reachable' ? 'dashed' : 'solid',
        borderColor: paint.color,
        boxShadow: isCurrent ? `0 0 0 3px ${T.primary}33` : 'none',
        opacity: paint.dim,
        color: T.textPrimary,
        fontFamily: T.fontSans,
        cursor: d.jumpable ? 'pointer' : 'default',
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE} isConnectable={false} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden
          style={{ flex: '0 0 auto', width: 8, height: 8, borderRadius: 2, background: paint.color }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {d.label}
        </span>
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: paint.color,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <span>{d.stateLabel}</span>
        {d.pickedByModel && (
          <span
            style={{
              padding: '1px 5px',
              borderRadius: 5,
              background: `${T.bgPrimary}`,
              border: `1px solid ${T.srcSkill}`,
              color: T.srcSkill,
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            model&apos;s pick
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE} isConnectable={false} />
    </div>
  );
};

const NODE_TYPES: NodeTypes = { sgdSkill: SkillStateNode };

export interface SkillTopologyCanvasProps {
  readonly topology: SkillTopology;
  readonly lens: SkillLens;
  /** Fired when a node is clicked and the cursor CAN go there. */
  readonly onPickSkill?: (skillId: string) => void;
  /** Skills the cursor stood in at some beat — the only clickable ones. */
  readonly jumpable: ReadonlySet<string>;
}

export function SkillTopologyCanvas({
  topology,
  lens,
  onPickSkill,
  jumpable,
}: SkillTopologyCanvasProps): React.ReactElement {
  // Positions depend on the graph's SHAPE only, so scrubbing never re-lays it out.
  const positions = useMemo(
    () =>
      skillTopologyPositions(
        topology.nodes.map((n) => n.id),
        topology.edges,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      topology.nodes.map((n) => n.id).join('|'),
      topology.edges.map((e) => e.id).join('|'),
    ],
  );

  const rfNodes = useMemo<Node[]>(
    () =>
      topology.nodes.map((n) => {
        const p = positions.get(n.id);
        return {
          id: n.id,
          type: 'sgdSkill',
          position: { x: p?.x ?? 0, y: p?.y ?? 0 },
          draggable: false,
          selectable: true,
          data: {
            label: n.id,
            state: n.state,
            stateLabel: lens === 'product' ? STATE_STYLE[n.state].product : STATE_STYLE[n.state].developer,
            pickedByModel: n.pickedByModel,
            jumpable: jumpable.has(n.id),
          } satisfies SkillNodeData,
        };
      }),
    [topology.nodes, positions, lens, jumpable],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      topology.edges.map((e) => {
        const color = e.active ? T.primary : e.observed ? T.srcSkill : T.edgeDefault;
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          // NOT `animated`: xyflow animates an edge by MARCHING DASHES, which
          // is the exact stroke this canvas reserves for "the run took it, the
          // record never declared it". The active hop is said with weight and
          // colour instead, so one visual means one thing.
          animated: false,
          label: e.label ?? (lens === 'developer' ? e.triggerKind : undefined),
          style: {
            stroke: color,
            strokeWidth: e.active ? 3 : 1.5,
            // An edge the run took but the record never declared is the one a
            // reader must not mistake for the author's own line.
            strokeDasharray: e.observed && !e.declared ? '5 4' : undefined,
          },
          labelStyle: { fill: T.textMuted, fontFamily: T.fontSans, fontSize: 10 },
          labelBgStyle: { fill: T.bgPrimary, fillOpacity: 0.85 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        };
      }),
    [topology.edges, lens],
  );

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      data-testid="skill-topology"
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_, node) => {
            if (jumpable.has(node.id)) onPickSkill?.(node.id);
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.1}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={T.border} gap={20} />
        </ReactFlow>
      </ReactFlowProvider>
      </div>
      <Legend topology={topology} lens={lens} />
    </div>
  );
}

function Legend({
  topology,
  lens,
}: {
  topology: SkillTopology;
  lens: SkillLens;
}): React.ReactElement {
  const states: SkillNodeState[] = ['current', 'reachable', 'visited', 'refused', 'idle'];
  return (
    <div
      data-testid="skill-topology-legend"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        flexWrap: 'wrap',
        padding: '6px 10px',
        borderTop: `1px solid ${T.border}`,
        background: T.bgPrimary,
        fontFamily: T.fontSans,
        fontSize: 10,
        color: T.textSecondary,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        {states.map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: STATE_STYLE[s].color,
              }}
            />
            {lens === 'product' ? STATE_STYLE[s].product : STATE_STYLE[s].developer}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        <span>— solid: an edge the author declared</span>
        <span>┄ dashed: a hop the run took, never declared on the record</span>
      </div>
      {topology.declaredSource !== 'graph' && (
        <div style={{ flex: '1 1 100%', color: T.warning, lineHeight: 1.35 }}>
          {topology.declaredSource === 'recording'
            ? 'Declared edges shown are only the ones this recording named — a recording names an edge once it fires, so the author may have drawn more.'
            : 'This recording named no declared edges; every line here is a hop that was observed.'}
        </div>
      )}
    </div>
  );
}
