/**
 * AgentCardNode — collapsed top-level card representing ONE primitive
 * boundary in the multi-agent / multi-LLM view.
 *
 * Rendered ONLY when:
 *   - `drillPath.length === 0` (top-level, not drilled in)
 *   - the run has >1 primitive boundary (single-agent runs use the
 *     existing AgentGroupNode dashed container instead)
 *
 * Visual differentiator language:
 *   - **Solid border** for ATOMIC primitives (Agent, LLMCall) — they DO
 *     compute. The Agent gets a stronger 2px border + amber accent so
 *     it stands out as "the actor."
 *   - **Dashed border** for COMPOSITIONS (Sequence, Parallel, Loop,
 *     Conditional) — they ROUTE work; not actors.
 *   - One emoji icon + display name in the header strip; rollup chips
 *     (tokens / iterations / tool calls / duration) below.
 *   - Live activity badge in the top-right corner.
 *
 * Click → drill in (handled by RunTreeFlow's `onNodeDoubleClick` →
 * `onDrillInto(runtimeStageId)` chain).
 */

import React from 'react';
import type { Node, NodeProps } from '@xyflow/react';

// ─── Per-primitive visual affordance ───────────────────────────────

interface Affordance {
  readonly icon: string;
  readonly subtitle: string;
  /** CSS color expression for the border + header accent. */
  readonly accent: string;
  /** `'solid'` for atomic primitives, `'dashed'` for compositions. */
  readonly borderStyle: 'solid' | 'dashed';
  /** Border width — Agent gets a thicker stroke to stand out. */
  readonly borderWidth: number;
}

function primitiveAffordance(kind: string | undefined): Affordance {
  switch (kind) {
    case 'Agent':
      return {
        icon: '🤖',
        subtitle: 'ReAct loop',
        accent: 'var(--lens-accent, #f59e0b)',
        borderStyle: 'solid',
        borderWidth: 2,
      };
    case 'LLMCall':
      return {
        icon: '📡',
        subtitle: 'one-shot',
        accent: 'var(--lens-edge-user, #0284c7)',
        borderStyle: 'solid',
        borderWidth: 1.5,
      };
    case 'Sequence':
      return {
        icon: '➡️',
        subtitle: 'pipeline',
        accent: 'var(--lens-text-muted, #64748b)',
        borderStyle: 'dashed',
        borderWidth: 1.5,
      };
    case 'Parallel':
      return {
        icon: '🔀',
        subtitle: 'fan-out',
        accent: 'var(--lens-text-muted, #64748b)',
        borderStyle: 'dashed',
        borderWidth: 1.5,
      };
    case 'Conditional':
      return {
        icon: '🪧',
        subtitle: 'route',
        accent: 'var(--lens-text-muted, #64748b)',
        borderStyle: 'dashed',
        borderWidth: 1.5,
      };
    case 'Loop':
      return {
        icon: '🔁',
        subtitle: 'iterate',
        accent: 'var(--lens-text-muted, #64748b)',
        borderStyle: 'dashed',
        borderWidth: 1.5,
      };
    default:
      return {
        icon: '⚙️',
        subtitle: 'runner',
        accent: 'var(--lens-text-muted, #64748b)',
        borderStyle: 'solid',
        borderWidth: 1.5,
      };
  }
}

// ─── Card data shape ───────────────────────────────────────────────

export interface AgentCardNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly primitiveKind?: string;
  readonly selected: boolean;
  /** Live status — drives the activity badge in the top-right. */
  readonly status: 'running' | 'in-flight-active' | 'done' | 'error';
  /** Per-boundary rollup. Optional because rollup is still being
   *  computed when the boundary just opened. */
  readonly rollup?: {
    readonly tokens?: { readonly input: number; readonly output: number };
    readonly llmCalls?: number;
    readonly toolCalls?: number;
    readonly iterations?: number;
    readonly durationMs?: number;
  };
}

export const AGENT_CARD_WIDTH = 280;
export const AGENT_CARD_HEIGHT = 140;

// ─── Component ────────────────────────────────────────────────────

export const AgentCardNode: React.FC<NodeProps<Node<AgentCardNodeData>>> = ({ data }) => {
  const aff = primitiveAffordance(data.primitiveKind);
  const r = data.rollup;
  return (
    <div
      style={{
        width: AGENT_CARD_WIDTH,
        // Use min-height so cards with no rollup don't feel cramped, but
        // can grow if more chips need to fit.
        minHeight: AGENT_CARD_HEIGHT,
        borderRadius: 14,
        border: `${aff.borderWidth}px ${aff.borderStyle} ${aff.accent}`,
        background: 'var(--lens-bg-elevated, #fff)',
        boxShadow: data.selected
          ? `0 0 0 2px ${aff.accent}, 0 4px 16px rgba(0,0,0,0.08)`
          : '0 1px 4px rgba(0,0,0,0.06)',
        fontFamily: 'var(--lens-font-sans, ui-sans-serif, system-ui)',
        color: 'var(--lens-text, #1e293b)',
        // Re-enabled in v0.15.0 — drill-from-card now passes the
        // agent's full subflowPath, which selectStepView matches by
        // prefix. Double-click drills into this card's agent.
        cursor: 'zoom-in',
        position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
    >
      {/* Header strip — icon + name on the left, status badge on the right. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          background: `color-mix(in srgb, ${aff.accent} 12%, transparent)`,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottom: `1px solid color-mix(in srgb, ${aff.accent} 30%, transparent)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
            {aff.icon}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={data.label}
            >
              {data.label}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--lens-text-muted, #64748b)',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {aff.subtitle}
            </span>
          </div>
        </div>
        <StatusBadge status={data.status} accent={aff.accent} />
      </div>

      {/* Body — rollup chips. Hidden when no rollup yet. */}
      {r && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            padding: '10px 12px',
            fontSize: 11,
            color: 'var(--lens-text, #1e293b)',
          }}
        >
          {r.tokens && (r.tokens.input > 0 || r.tokens.output > 0) && (
            <Chip>
              <span style={{ opacity: 0.6 }}>◇</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {r.tokens.input}↗
              </span>
              <span style={{ opacity: 0.5 }}>/</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {r.tokens.output}↘
              </span>
            </Chip>
          )}
          {typeof r.iterations === 'number' && r.iterations > 0 && (
            <Chip>
              <span aria-hidden>🔁</span>
              <span style={{ fontWeight: 600 }}>{r.iterations}</span>
            </Chip>
          )}
          {typeof r.toolCalls === 'number' && r.toolCalls > 0 && (
            <Chip>
              <span aria-hidden>🔧</span>
              <span style={{ fontWeight: 600 }}>{r.toolCalls}</span>
            </Chip>
          )}
          {typeof r.llmCalls === 'number' && r.llmCalls > 0 && (
            <Chip>
              <span aria-hidden>💬</span>
              <span style={{ fontWeight: 600 }}>{r.llmCalls}</span>
            </Chip>
          )}
          {typeof r.durationMs === 'number' && (
            <Chip>
              <span aria-hidden>⏱</span>
              <span style={{ fontWeight: 600 }}>{formatDuration(r.durationMs)}</span>
            </Chip>
          )}
        </div>
      )}

      {/* Subtle drill-in hint — bottom right. */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          right: 8,
          fontSize: 9,
          color: 'var(--lens-text-muted, #64748b)',
          opacity: 0.5,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        drill in ↘
      </div>
    </div>
  );
};

// ─── Status badge ─────────────────────────────────────────────────

const StatusBadge: React.FC<{
  status: AgentCardNodeData['status'];
  accent: string;
}> = ({ status, accent }) => {
  switch (status) {
    case 'in-flight-active':
      return (
        <span
          aria-label="active"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: 999,
            background: accent,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            animation: 'lens-blink 1.2s ease-in-out infinite',
          }}
        >
          ⚡
        </span>
      );
    case 'done':
      return (
        <span
          aria-label="done"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: 999,
            background: 'var(--lens-edge-tool, #059669)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          ✓
        </span>
      );
    case 'error':
      return (
        <span
          aria-label="error"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            borderRadius: 999,
            background: '#dc2626',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          ✗
        </span>
      );
    case 'running':
    default:
      return (
        <span
          aria-label="running"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accent,
            opacity: 0.6,
          }}
        />
      );
  }
};

// ─── Chip ─────────────────────────────────────────────────────────

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 7px',
      borderRadius: 999,
      background: 'var(--lens-bg-dim, rgba(100,116,139,0.08))',
      fontSize: 11,
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    {children}
  </span>
);

// ─── Helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
