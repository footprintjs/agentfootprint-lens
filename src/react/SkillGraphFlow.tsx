/**
 * <SkillGraphFlow> — an interactive, two-panel view of a skill graph.
 *
 *   import { SkillGraphFlow } from 'agentfootprint-lens';
 *   import { skillGraph, decideSkill } from 'agentfootprint/injection-engine';
 *
 *   const graph = skillGraph().tree(decideSkill(isIo, ioSkill, triageSkill, 'io?')).build();
 *   <SkillGraphFlow graph={graph} detailFor={(node) => describe(node.id)} />
 *
 * The richer companion to `graph.toMermaid()`: predicate **diamonds** route to
 * skill **boxes** (the decision tree from `skillGraph().tree(...)`), or entry +
 * routing edges (the flat `entry`/`route` model). Click a node → its detail shows
 * in the side panel. Pure presentation: it renders the STRUCTURE the graph already
 * carries (`graph.nodes` / `graph.edges`); it doesn't run the agent.
 *
 * Decoupled from agentfootprint by structural typing — `SkillGraphView` matches
 * the shape of agentfootprint's `SkillGraph`, so a built graph passes straight in.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { T } from './theme/index.js';
import {
  layoutSkillGraph,
  routingPathTo,
  sizeFor,
  type SkillGraphNodeView,
  type SkillGraphEdgeView,
  type SkillRoutingPathStep,
} from './skillGraphFlowLayout.js';

/** The graph structure to draw — matches agentfootprint's `SkillGraph`. */
export interface SkillGraphView {
  readonly nodes: readonly SkillGraphNodeView[];
  readonly edges: readonly SkillGraphEdgeView[];
}

/** Detail shown in the side panel when a node is selected. */
export interface SkillNodeDetail {
  /** Heading; defaults to the node's label/id. */
  readonly title?: string;
  /** One-line description (a skill's `description`). */
  readonly description?: string;
  /** The skill body / system prompt (rendered monospace). */
  readonly body?: string;
  /** Tool names the skill unlocks. */
  readonly tools?: readonly string[];
  /** Extra label/value rows (e.g. trigger kind). */
  readonly meta?: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
  }>;
}

export interface SkillGraphFlowProps {
  /** The built graph (`skillGraph()....build()`). */
  readonly graph: SkillGraphView;
  /** Resolve a node → its side-panel detail. Called for skill + predicate nodes. */
  readonly detailFor?: (node: SkillGraphNodeView) => SkillNodeDetail | undefined;
  /** Controlled selection — the selected node id (or `null`). */
  readonly selectedId?: string | null;
  /** Uncontrolled initial selection. Ignored when `selectedId` is set. */
  readonly defaultSelectedId?: string | null;
  /** Fired when the selection changes (node click, or pane click → `null`). */
  readonly onSelectNode?: (id: string | null) => void;
  /** Draw the synthetic START chip + entry edges. Default `true`. */
  readonly showStart?: boolean;
  /** Hide the side detail panel (graph-only). Default `false`. */
  readonly hideDetailPanel?: boolean;
  /** Initial detail-panel width in px (drag the divider to resize). Default `320`. */
  readonly defaultPanelWidth?: number;
  /** Container height. Default `'100%'`. */
  readonly height?: number | string;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

interface FlowNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly isSelected: boolean;
}

const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none',
};

const StartNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData;
  return (
    <div
      style={{
        ...sizeFor('start'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        background: T.bgTertiary,
        color: T.textSecondary,
        border: `1px solid ${T.border}`,
        fontFamily: T.fontSans,
        fontSize: 12,
        fontWeight: 600,
        boxSizing: 'border-box',
      }}
    >
      {d.label}
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} isConnectable={false} />
    </div>
  );
};

const SkillBoxNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData;
  return (
    <div
      style={{
        ...sizeFor('skill'),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        borderRadius: 10,
        background: T.bgSecondary,
        color: T.textPrimary,
        border: `${d.isSelected ? 2 : 1}px solid ${d.isSelected ? T.srcSkill : T.border}`,
        boxShadow: d.isSelected ? `0 0 0 3px ${T.srcSkill}33` : 'none',
        fontFamily: T.fontSans,
        fontSize: 13,
        fontWeight: 600,
        boxSizing: 'border-box',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} isConnectable={false} />
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          width: 8,
          height: 8,
          borderRadius: 2,
          background: T.srcSkill,
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {d.label}
      </span>
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} isConnectable={false} />
    </div>
  );
};

const PredicateNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as FlowNodeData;
  const { width, height } = sizeFor('predicate');
  return (
    <div style={{ width, height, position: 'relative', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} isConnectable={false} />
      {/* The diamond — clipped square; clicks register on the full bounding box. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: T.bgSecondary,
          border: `${d.isSelected ? 2 : 1}px solid ${d.isSelected ? T.edgeDecision : T.border}`,
          boxShadow: d.isSelected ? `0 0 0 3px ${T.edgeDecision}33` : 'none',
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 32px',
          textAlign: 'center',
          color: T.textPrimary,
          fontFamily: T.fontSans,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.2,
          boxSizing: 'border-box',
        }}
      >
        {d.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} isConnectable={false} />
    </div>
  );
};

const NODE_TYPES: NodeTypes = {
  sgStart: StartNode,
  sgPredicate: PredicateNode,
  sgSkill: SkillBoxNode,
};

function RoutingPath({ steps }: { steps: readonly SkillRoutingPathStep[] }): React.ReactElement {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>REACHED WHEN</div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {steps.map((s, i) => (
          <React.Fragment key={`${s.predicate}-${i}`}>
            {i > 0 && <span style={{ color: T.textMuted }}>→</span>}
            <span style={{ fontSize: 12, color: T.textSecondary }}>
              {s.predicate}{' '}
              <strong style={{ color: s.branch === 'yes' ? T.srcSkill : T.textMuted }}>
                {s.branch}
              </strong>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  node,
  detail,
  routingPath,
  width,
}: {
  node: SkillGraphNodeView | null;
  detail: SkillNodeDetail | undefined;
  routingPath: readonly SkillRoutingPathStep[];
  width: number;
}): React.ReactElement {
  const panel: React.CSSProperties = {
    width,
    flex: `0 0 ${width}px`,
    borderLeft: `1px solid ${T.border}`,
    background: T.bgPrimary,
    color: T.textPrimary,
    fontFamily: T.fontSans,
    padding: 16,
    overflow: 'auto',
    boxSizing: 'border-box',
  };

  if (!node) {
    return (
      <aside style={panel} data-testid="skill-graph-detail">
        <p style={{ color: T.textMuted, fontSize: 13, margin: 0 }}>
          Click a node to inspect it. Diamonds are decision predicates; boxes are skills that load
          just-in-time when their path is chosen.
        </p>
      </aside>
    );
  }

  const isPredicate = node.kind === 'predicate';
  const accent = isPredicate ? T.edgeDecision : T.srcSkill;
  return (
    <aside style={panel} data-testid="skill-graph-detail">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: accent,
          }}
        >
          {isPredicate ? '◇ Decision' : '▢ Skill'}
        </span>
      </div>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{detail?.title ?? node.label ?? node.id}</h3>

      {isPredicate && !detail && (
        <p style={{ color: T.textSecondary, fontSize: 13, margin: 0 }}>
          Routes to its <strong>yes</strong> / <strong>no</strong> subtree based on this predicate,
          evaluated every iteration.
        </p>
      )}

      {detail?.description && (
        <p style={{ color: T.textSecondary, fontSize: 13, margin: '0 0 12px' }}>
          {detail.description}
        </p>
      )}

      {routingPath.length > 0 && <RoutingPath steps={routingPath} />}

      {detail?.meta?.map((row) => (
        <div key={row.label} style={{ fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: T.textMuted }}>{row.label}: </span>
          <span style={{ color: T.textSecondary }}>{row.value}</span>
        </div>
      ))}

      {detail?.tools && detail.tools.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
            UNLOCKS {detail.tools.length} TOOL
            {detail.tools.length === 1 ? '' : 'S'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.tools.map((tool) => (
              <span
                key={tool}
                style={{
                  fontFamily: T.fontMono,
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: T.bgTertiary,
                  color: T.textSecondary,
                }}
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {detail?.body && (
        <pre
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: T.bgSecondary,
            color: T.textSecondary,
            fontFamily: T.fontMono,
            fontSize: 11.5,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'auto',
          }}
        >
          {detail.body}
        </pre>
      )}
    </aside>
  );
}

export const SkillGraphFlow: React.FC<SkillGraphFlowProps> = ({
  graph,
  detailFor,
  selectedId: selectedIdProp,
  defaultSelectedId = null,
  onSelectNode,
  showStart = true,
  hideDetailPanel = false,
  defaultPanelWidth = 320,
  height = '100%',
  className,
  style,
}) => {
  const isControlled = selectedIdProp !== undefined;
  const [internalSelected, setInternalSelected] = useState<string | null>(defaultSelectedId);
  const selectedId = isControlled ? selectedIdProp : internalSelected;

  const select = useCallback(
    (id: string | null) => {
      if (!isControlled) setInternalSelected(id);
      onSelectNode?.(id);
    },
    [isControlled, onSelectNode],
  );

  // Resizable detail panel — drag the divider to widen it for long skill bodies.
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(defaultPanelWidth);
  const [dragging, setDragging] = useState(false);
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Panel hugs the right edge; its width is the gap from the cursor to it.
      const next = rect.right - ev.clientX;
      const max = Math.max(240, rect.width - 240); // always leave room for the graph
      setPanelWidth(Math.min(max, Math.max(220, next)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const { rfNodes, rfEdges } = useMemo(() => {
    const laid = layoutSkillGraph(graph, { showStart });
    const rfNodes: Node[] = laid.nodes.map((n) => ({
      id: n.id,
      type: n.kind === 'start' ? 'sgStart' : n.kind === 'predicate' ? 'sgPredicate' : 'sgSkill',
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      draggable: false,
      selectable: n.kind !== 'start',
      data: {
        label: n.label,
        isSelected: n.id === selectedId,
      } satisfies FlowNodeData,
    }));
    const rfEdges: Edge[] = laid.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      style: {
        stroke: T.edgeDefault,
        strokeWidth: 1.5,
        strokeDasharray: e.dashed ? '5 4' : undefined,
      },
      labelStyle: { fill: T.textMuted, fontFamily: T.fontSans, fontSize: 11 },
      labelBgStyle: { fill: T.bgPrimary, fillOpacity: 0.85 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: T.edgeDefault,
        width: 16,
        height: 16,
      },
    }));
    return { rfNodes, rfEdges };
  }, [graph, showStart, selectedId]);

  const selectedNode = useMemo(
    () => (selectedId ? (graph.nodes.find((n) => n.id === selectedId) ?? null) : null),
    [graph.nodes, selectedId],
  );
  const detail = selectedNode && detailFor ? detailFor(selectedNode) : undefined;
  const routingPath = useMemo(
    () => (selectedNode ? routingPathTo(graph, selectedNode.id) : []),
    [graph, selectedNode],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        height,
        width: '100%',
        background: T.bgPrimary,
        // While dragging, suppress text selection + let the divider own the cursor.
        userSelect: dragging ? 'none' : undefined,
        cursor: dragging ? 'col-resize' : undefined,
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodeClick={(_, node) => select(node.id)}
            onPaneClick={() => select(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={T.border} gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      {!hideDetailPanel && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            data-testid="skill-graph-resizer"
            onMouseDown={startResize}
            title="Drag to resize"
            style={{
              flex: '0 0 6px',
              cursor: 'col-resize',
              background: dragging ? T.srcSkill : T.border,
              transition: dragging ? undefined : 'background 120ms',
            }}
          />
          <DetailPanel
            node={selectedNode}
            detail={detail}
            routingPath={routingPath}
            width={panelWidth}
          />
        </>
      )}
    </div>
  );
};
