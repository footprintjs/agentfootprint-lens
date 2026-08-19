/**
 * withGroupEmphasis — the chart node wrapper that makes a group read as ONE unit.
 *
 * ── The problem it fixes ────────────────────────────────────────────────────
 * On the grouped ruler the cursor is a GROUP, but the chart kept painting like
 * the cursor was a stage: the LLM call carries `emphasis: 'hero'` (accent
 * border, tinted fill, glow — see `structureGraphFromRunner`) and the overlay's
 * one active node pulses. Land on a group of six nodes and the eye is pulled to
 * the LLM box, so the GROUP — the thing the ruler actually moved by — never
 * reads as the position at all.
 *
 * ── What this does ──────────────────────────────────────────────────────────
 * In group mode ONLY, every node renderer is wrapped so that:
 *
 *   member    → the type-emphasis is dropped (`emphasis`/`active` cleared) and
 *               the lens paints ONE accent over the card. Six members, one tint,
 *               one intensity — an LLM, a tool and a context pill light the same.
 *   outsider  → dropped the same way and dimmed, uniformly.
 *
 * Node TYPE stays legible where it belongs: the icon, the card's shape (decider
 * diamonds, slot pills) and its size are untouched, because those are what the
 * node IS — not how loud it is.
 *
 * `active` is PRESERVED — deliberately, and this is a reversal of the first
 * grouped design. The group is still the PLACE (the boundary box + one member
 * accent say so), but the person scrubbing is standing on ONE step inside that
 * place, and a chart that refuses to show which one has no "you are here" at
 * all. The overlay marks exactly one current node (plus a parallel cohort's
 * co-actives at a Context stop), so preserving it lights one node, not eight.
 * `done` IS cleared on top of the uniform accent: the members must read as one
 * unit, and per-member visited tinting would fracture that reading — the ⛓
 * step lens is where per-step done/visited state belongs.
 *
 * ── Why the emphasis is safe to drop ────────────────────────────────────────
 * `emphasis` drives colour only (fill / border / glow / a 0.5 opacity for
 * plumbing). `size` — which DOES change the measured footprint, and which the
 * layout's node-size resolver must agree with — is left exactly as it was. So
 * nothing re-measures and the chart cannot re-lay-out mid-scrub.
 *
 * The wrapper element is intentionally NOT positioned: xyflow's `.react-flow__node`
 * stays the nearest positioned ancestor, so the node's connection handles land
 * where they always did and the accent overlay covers the real node box.
 */

import React, { memo, useMemo } from 'react';
import type { ComponentType } from 'react';
import type { NodeProps, NodeTypes } from '@xyflow/react';
import { useChartGroupHighlight } from './ChartGroupContext.js';

/** Class on every wrapped node — the hook a consumer's own CSS can use. */
export const GROUP_NODE_CLASS = 'lens-group-node';
/** Class on nodes that belong to the active group. */
export const GROUP_MEMBER_CLASS = 'lens-group-node--member';
/** Class on nodes that do not. */
export const GROUP_OUTSIDER_CLASS = 'lens-group-node--outsider';

/**
 * Wrap one node renderer so it answers to the active group. Outside group mode
 * the wrapper renders the original component with the original props — the same
 * element tree today's chart produces.
 */
export function withGroupEmphasis(Inner: ComponentType<NodeProps>): ComponentType<NodeProps> {
  const Wrapped = (props: NodeProps): React.ReactElement => {
    const group = useChartGroupHighlight();
    const member = group !== undefined && group.memberNodeIds.has(props.id);

    // Hooks run unconditionally (rules of hooks); the no-group path below
    // ignores the result.
    const data = useMemo(
      () =>
        group === undefined
          ? props.data
          : ({
              ...(props.data as Record<string, unknown>),
              // One emphasis for everyone: no hero, no plumbing, no spotlight —
              // and no per-member visited tint (see the header). `active` rides
              // through untouched: the cursor's ONE current node lights inside
              // the boundary (derived from the overlay every render — no stored
              // highlight state, per the one-cursor law).
              emphasis: undefined,
              done: false,
              stepNumbers: undefined,
            } as typeof props.data),
      [props.data, group],
    );

    if (group === undefined) return <Inner {...props} />;

    return (
      <div
        className={`${GROUP_NODE_CLASS} ${member ? GROUP_MEMBER_CLASS : GROUP_OUTSIDER_CLASS}`}
        data-lens-group={member ? 'member' : 'outsider'}
      >
        <Inner {...props} data={data} />
      </div>
    );
  };
  Wrapped.displayName = `withGroupEmphasis(${Inner.displayName ?? Inner.name ?? 'Node'})`;
  return memo(Wrapped);
}

/**
 * Wrap a whole `nodeTypes` map — plus eui's built-in `stageNode`, which a chart
 * gets for free and which would otherwise be the one renderer that kept its
 * hero styling.
 *
 * The returned map must be MEMOISED by the caller on the inputs only (never on
 * the cursor): xyflow keys node components by map identity, so a fresh map per
 * scrub remounts the chart.
 */
export function withGroupEmphasisAll(
  nodeTypes: NodeTypes | undefined,
  stageNode: NodeTypes[string],
): NodeTypes {
  const wrap = (Component: NodeTypes[string]): NodeTypes[string] =>
    withGroupEmphasis(Component as unknown as ComponentType<NodeProps>) as unknown as NodeTypes[string];
  const out: NodeTypes = { stageNode: wrap(stageNode) };
  for (const [key, Component] of Object.entries(nodeTypes ?? {})) {
    out[key] = wrap(Component);
  }
  return out;
}
