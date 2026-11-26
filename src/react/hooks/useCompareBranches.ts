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
 *     - systemPrompt   = the branch's last system-prompt slot exit
 *                        payload as text
 *     - messages       = the last messages slot exit as an array of
 *                        {role, content}
 *     - tools          = the last tools slot exit as an array of
 *                        {name, description}
 *
 *   A slot exit is read from the last model-call step's `slotBoundaries`
 *   (where agentfootprint puts it), else from the last step whose
 *   `slotUpdated` names that slot and carries `exitPayload` itself. When
 *   the recording stores slot payloads with their slot invocations, the hook
 *   asks for those children (the last three per branch) and each section says
 *   which payload is not loaded or unavailable, never that it is empty.
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

import { useEffect, useMemo } from 'react';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import type { StepGraph, StepNode } from 'agentfootprint/observe';
import { parseRoleFromDescription } from '../../core/utils/parseRoleFromDescription.js';
import { ROW_ONLY_PAYLOADS, type PayloadHolder, type StepPayload, type StepPayloadReader } from '../../core/subflowPayloads/index.js';

/** Where one column section's slot exit payload is. */
export type BranchSectionState = { readonly state: 'recorded' | 'none' } | Extract<StepPayload, { state: 'not-loaded' | 'unavailable' }>;

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
  /** Whether each slot section was shown, recorded none, or is withheld (not loaded or unavailable). Set by `useCompareBranches`. */
  readonly sections?: {
    readonly systemPrompt: BranchSectionState;
    readonly messages: BranchSectionState;
    readonly tools: BranchSectionState;
  };
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

/** The branch's last exit holder for one slot. */
function slotSource(
  steps: readonly StepNode[],
  slot: 'system-prompt' | 'messages' | 'tools',
  prop: 'systemPrompt' | 'messages' | 'tools',
): PayloadHolder | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const bound = steps[i]!.slotBoundaries?.[prop];
    if (bound) return bound;
  }
  const legacy = lastBySlot(steps, slot);
  return legacy && { ...(legacy.runtimeStageId !== undefined && { runtimeStageId: legacy.runtimeStageId }),
    exitPayload: (legacy as { exitPayload?: unknown }).exitPayload };
}

function sectionState(payload: StepPayload): BranchSectionState {
  return payload.state === 'recorded' || payload.state === 'none' ? { state: payload.state } : payload;
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
  reader: StepPayloadReader,
): { column: BranchColumn; holders: readonly (PayloadHolder | undefined)[] } {
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

  const holders = [
    slotSource(steps, 'system-prompt', 'systemPrompt'),
    slotSource(steps, 'messages', 'messages'),
    slotSource(steps, 'tools', 'tools'),
  ] as const;
  const [sys, msg, tool] = holders.map(holder => reader.read(holder, 'exit')) as [StepPayload, StepPayload, StepPayload];
  const valueOf = (payload: StepPayload) => (payload.state === 'recorded' ? payload.value : undefined);

  return {
    holders,
    column: {
      branchId,
      branchName,
      systemPrompt: asText(valueOf(sys)),
      messages: asMessages(valueOf(msg)),
      tools: asTools(valueOf(tool)),
      response,
      tokenCount: { input: inputTokens, output: outputTokens },
      status: deriveStatus(branchSubflowStep),
      sections: { systemPrompt: sectionState(sys), messages: sectionState(msg), tools: sectionState(tool) },
    },
  };
}

/**
 * @param payloads where slot payloads are (`useStepPayloads`), and how to ask
 *   for the slot invocations a column needs. Default: the row only.
 */
export function useCompareBranches(
  currentSpec: SpecNode | undefined,
  stepGraph: StepGraph | undefined,
  payloads?: { readonly reader: StepPayloadReader; readonly request?: (invocations: readonly string[]) => void },
): readonly BranchColumn[] | null {
  const reader = payloads?.reader ?? ROW_ONLY_PAYLOADS;
  const built = useMemo(() => {
    if (!currentSpec || !stepGraph) return null;
    if (!isParallelFork(currentSpec)) return null;
    const branches = currentSpec.children ?? [];
    return branches.map((b) => buildColumn(b, stepGraph, reader));
  }, [currentSpec, stepGraph, reader]);
  // The last three slot invocations per branch, once each.
  const needed = built === null ? [] : reader.needed(built.flatMap(b => b.holders.map(holder => [holder, 'exit'] as const)));
  const neededKey = needed.join('\u0000');
  const request = payloads?.request;
  useEffect(() => {
    if (needed.length > 0) request?.(needed);
    // The key names the exact set; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey, request]);
  return useMemo(() => (built === null ? null : built.map(b => b.column)), [built]);
}
