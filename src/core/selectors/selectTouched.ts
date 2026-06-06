/**
 * `selectTouched` — compute the set of actors touched by the visible steps.
 *
 * Pattern: pure reduce over a step slice. Drives "hide un-used actors"
 *          rendering (Tool stays hidden until an `llm->tool` /
 *          `tool->llm` step appears within focus).
 * Role:    Progressive-reveal support. Matches v1's `touched` set
 *          used in `StageFlow.tsx`.
 */

import type { StepNode } from 'agentfootprint';
import type { ActorId } from './types.js';

/**
 * Return the set of actors (user / llm / tool / skill) that at least
 * one step in `visibleSteps` involves. USER is always included — the
 * run begins with a user message regardless.
 *
 * Note: `skill` currently piggy-backs on step labels containing
 * "skill" — upgraded to a real field once agentfootprint surfaces
 * skill activation as a distinct step kind.
 */
export function selectTouched(
  visibleSteps: readonly StepNode[],
): ReadonlySet<ActorId> {
  const touched = new Set<ActorId>(['user']);
  for (const s of visibleSteps) {
    if (s.kind === 'llm->tool' || s.kind === 'tool->llm') touched.add('tool');
    if (
      s.kind === 'user->llm' ||
      s.kind === 'tool->llm' ||
      s.kind === 'llm->user'
    ) {
      touched.add('llm');
    }
    if (s.label.toLowerCase().includes('skill')) touched.add('skill');
  }
  return touched;
}
