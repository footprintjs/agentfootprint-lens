/**
 * useCompareBranches — column data for the compare-branches panel.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * When the current view's Spec subtree IS a parallel fork — i.e. its
 * description carries the `'Parallel:'` taxonomy prefix and it has
 * sibling subflow children — build one `BranchColumn` per branch. When
 * the current view is anything else, returns `null` so callers can
 * unmount the panel.
 *
 * Column population
 * ─────────────────
 *   For each fork-branch subflow we scan the StepGraph for StepNodes
 *   whose `subflowPath` is rooted under that branch's subflowId. From
 *   those steps we project the four UI sections:
 *
 *     - response       = last `llm->user` step's `assistantText`
 *     - tokenCount     = SUM of `tokens.in` / `tokens.out` across the
 *                        branch's LLM steps
 *     - status         = derived from the branch subflow's exit state
 *     - systemPrompt   = last `slotUpdated === 'system-prompt'` step's
 *                        rendered slot exitPayload as text
 *     - messages       = last `slotUpdated === 'messages'` step's
 *                        exitPayload as an array of {role, content}
 *     - tools          = last `slotUpdated === 'tools'` step's
 *                        exitPayload as an array of {name, description}
 *
 *   Payload shapes are duck-typed defensively — Lens v0.1 doesn't pin
 *   them to a strict schema since they vary by adapter. Anything that
 *   doesn't parse cleanly becomes the empty value for that section.
 *
 * Memoization
 * ───────────
 *   Re-runs only when `currentSpec` or `stepGraph` identity changes.
 *   Pair with `useSpecSubscription` (spec ref stable per structural
 *   change) and `useOverlaySubscription` (stepGraph ref stable until
 *   the next mutation in LensSnapshotRecorder).
 */

import { useMemo } from 'react';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import type { StepGraph, StepNode } from 'agentfootprint/observe';
import { parseRoleFromDescription } from '../../core/utils/parseRoleFromDescription.js';

export interface BranchColumn {
  readonly branchId: string;
  readonly branchName: string;
  readonly systemPrompt: string;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly tools: readonly { readonly name: string; readonly description: string }[];
  readonly response: string;
  readonly tokenCount: { readonly input: number; readonly output: number };
  readonly status: 'running' | 'ok' | 'failed';
  readonly errorMessage?: string;
}

function asMessages(payload: unknown): readonly { role: string; content: string }[] {
  if (!Array.isArray(payload)) return [];
  const out: { role: string; content: string }[] = [];
  for (const item of payload) {
    if (item && typeof item === 'object') {
      const role = typeof (item as { role?: unknown }).role === 'string'
        ? (item as { role: string }).role : '';
      const content = typeof (item as { content?: unknown }).content === 'string'
        ? (item as { content: string }).content : '';
      if (role.length > 0) out.push({ role, content });
    }
  }
  return out;
}

function asTools(payload: unknown): readonly { name: string; description: string }[] {
  if (!Array.isArray(payload)) return [];
  const out: { name: string; description: string }[] = [];
  for (const item of payload) {
    if (item && typeof item === 'object') {
      const name = typeof (item as { name?: unknown }).name === 'string'
        ? (item as { name: string }).name : '';
      const description = typeof (item as { description?: unknown }).description === 'string'
        ? (item as { description: string }).description : '';
      if (name.length > 0) out.push({ name, description });
    }
  }
  return out;
}

function asText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload == null) return '';
  if (typeof payload === 'object') {
    const text = (payload as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return '';
}

function isParallelFork(spec: SpecNode): boolean {
  return parseRoleFromDescription(spec.description).kind === 'Parallel'
    && Array.isArray(spec.children) && spec.children.length > 0;
}

function stepsInBranch(stepGraph: StepGraph, branchSubflowId: string): readonly StepNode[] {
  const out: StepNode[] = [];
  for (const n of stepGraph.nodes) {
    // A step belongs to a branch when its subflowPath contains the branch's id.
    if (n.subflowPath && n.subflowPath.includes(branchSubflowId)) {
      out.push(n);
    }
  }
  return out;
}

function lastBySlot(
  steps: readonly StepNode[],
  slot: 'system-prompt' | 'messages' | 'tools',
): StepNode | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]!.slotUpdated === slot) return steps[i];
  }
  return undefined;
}

function deriveStatus(branchSubflow: StepNode | undefined): 'running' | 'ok' | 'failed' {
  if (!branchSubflow) return 'running';
  if (branchSubflow.endOffsetMs === undefined) return 'running';
  // No explicit failure marker on StepNode v0.1 — treat presence of
  // endOffsetMs as ok. Reliability subsystem (v0.2+) will refine this.
  return 'ok';
}

function buildColumn(
  branch: SpecNode,
  stepGraph: StepGraph,
): BranchColumn {
  const branchId = branch.subflowId ?? branch.name;
  const branchName = branch.subflowName ?? branch.name;
  const steps = stepsInBranch(stepGraph, branchId);

  // Branch's representative subflow node is the kind='subflow' step
  // for the branch itself (if present in StepGraph).
  const branchSubflowStep = stepGraph.nodes.find(
    (n) => n.kind === 'subflow' && n.id === branchId,
  );

  // Response = last llm->user assistantText in the branch.
  let response = '';
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]!.kind === 'llm->user' && typeof steps[i]!.assistantText === 'string') {
      response = steps[i]!.assistantText!;
      break;
    }
  }

  // Token sum across LLM steps in the branch.
  let inputTokens = 0;
  let outputTokens = 0;
  for (const s of steps) {
    if (s.tokens) {
      inputTokens += s.tokens.in;
      outputTokens += s.tokens.out;
    }
  }

  const sysStep = lastBySlot(steps, 'system-prompt');
  const msgStep = lastBySlot(steps, 'messages');
  const toolStep = lastBySlot(steps, 'tools');

  return {
    branchId,
    branchName,
    systemPrompt: asText(sysStep && (sysStep as { exitPayload?: unknown }).exitPayload),
    messages: asMessages(msgStep && (msgStep as { exitPayload?: unknown }).exitPayload),
    tools: asTools(toolStep && (toolStep as { exitPayload?: unknown }).exitPayload),
    response,
    tokenCount: { input: inputTokens, output: outputTokens },
    status: deriveStatus(branchSubflowStep),
  };
}

export function useCompareBranches(
  currentSpec: SpecNode | undefined,
  stepGraph: StepGraph | undefined,
): readonly BranchColumn[] | null {
  return useMemo(() => {
    if (!currentSpec || !stepGraph) return null;
    if (!isParallelFork(currentSpec)) return null;
    const branches = currentSpec.children ?? [];
    return branches.map((b) => buildColumn(b, stepGraph));
  }, [currentSpec, stepGraph]);
}
