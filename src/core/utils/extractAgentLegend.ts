/**
 * extractAgentLegend — walk the Spec tree and collect every DISTINCT
 * Agent subflow for the legend strip.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * Used by `AgentLegendStrip` (Layer 3) to render one chip per agent
 * (model, role, color) above the flowchart in multi-agent scenes.
 *
 * Detection
 * ─────────
 *   An Agent subflow is identified by the agentfootprint convention:
 *   the chart-root description begins with `'Agent: '`. We delegate
 *   parsing to `parseRoleFromDescription` so the detection rule has
 *   exactly one source of truth.
 *
 * De-duplication
 * ──────────────
 *   Keyed by `subflowId` (preferred) or `name` (fallback). Multiple
 *   instances of the SAME agent in the spec (e.g., a Router that mounts
 *   the same Agent in two branches) appear ONCE in the legend.
 *
 * Color assignment
 * ────────────────
 *   `colorIdx = FNV-1a-hash(displayName) % 8` — deterministic across
 *   reloads, no preference for sort order. Lens design tokens supply
 *   the 8-color palette.
 *
 * Traversal
 * ─────────
 *   Recursive walk over `next` / `children` / `subflowStructure`.
 *   `loopTarget` is a name reference (not an embedded node) — not
 *   followed. We track visited SpecNode identities to defend against
 *   any accidental cycle in caller-supplied trees.
 */

import type { SpecNode } from '../buildSpecTreeFromBoundary.js';
import { parseRoleFromDescription } from './parseRoleFromDescription.js';

export interface AgentLegendEntry {
  /** Stable id from the spec. Falls back to `name` when subflowId absent. */
  readonly subflowId: string;
  /** Display name (subflowName preferred, else node name). */
  readonly name: string;
  /** Parsed role text after `'Agent:'` prefix. May be empty. */
  readonly role: string;
  /** Model identifier when discoverable from the spec. v0.1 = always undefined
   *  (spec doesn't carry model; future Layer 2 hook joins on snapshot). */
  readonly model?: string;
  /** 0..7 color palette index. Stable across runs. */
  readonly colorIdx: number;
}

/** FNV-1a 32-bit hash — small, fast, well-distributed over short names. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // unsigned
}

export function extractAgentLegend(spec: SpecNode): readonly AgentLegendEntry[] {
  const seen = new Set<string>();
  const visited = new WeakSet<SpecNode>();
  const result: AgentLegendEntry[] = [];

  // An explicit stack, not recursion: a spec built from a long run's
  // boundaries chains its steps by `next`, one link per step. Popping `next`
  // first, then `children`, then `subflowStructure` keeps the recursive order.
  const pending: (SpecNode | undefined)[] = [spec];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (visited.has(node)) continue;
    visited.add(node);

    const parsed = parseRoleFromDescription(node.description);
    if (parsed.kind === 'Agent') {
      const displayName = node.subflowName ?? node.name;
      const key = node.subflowId ?? displayName;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          subflowId: node.subflowId ?? key,
          name: displayName,
          role: parsed.role,
          colorIdx: fnv1a(displayName) % 8,
        });
      }
    }

    pending.push(node.subflowStructure);
    if (node.children) for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
    pending.push(node.next);
  }
  return result;
}
