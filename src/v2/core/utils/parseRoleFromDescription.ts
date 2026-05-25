/**
 * parseRoleFromDescription — extract agentfootprint's taxonomy marker
 * convention from a chart-root description.
 *
 * agentfootprint follows the convention: chart-root descriptions begin
 * with `<Kind>: <role>` where Kind ∈ {Agent, LLMCall, Parallel, Sequence,
 * Conditional, Loop}. Examples:
 *   'Agent: ReAct loop'             → { kind: 'Agent', role: 'ReAct loop' }
 *   'Parallel: 3-way fanout'        → { kind: 'Parallel', role: '3-way fanout' }
 *   'Sequence: stage1 → stage2'     → { kind: 'Sequence', role: 'stage1 → stage2' }
 *   'plain text description'        → { kind: undefined, role: 'plain text description' }
 *   ''                              → { kind: undefined, role: '' }
 *   undefined                       → { kind: undefined, role: '' }
 *
 * Pure function. Layer 1 / Tier C / Lens v0.1. Used by:
 *   - AgentLegendStrip (Layer 3) to label legend rows
 *   - agent-card hover popover (Layer 3) to show role
 *   - DrillableFlowchart breadcrumb decorations (Layer 4)
 *
 * Splits on the FIRST colon only. Role is trimmed but preserves
 * internal whitespace and the rest of the colon-bearing text.
 */

export interface ParsedRole {
  /** The primitive kind if the prefix matches a known agentfootprint primitive; undefined otherwise. */
  readonly kind: string | undefined;
  /** The role / display text after the colon, or the whole input when no kind matched. Trimmed. */
  readonly role: string;
}

function isKnownKind(s: string): boolean {
  switch (s) {
    case 'Agent':
    case 'LLMCall':
    case 'Parallel':
    case 'Sequence':
    case 'Conditional':
    case 'Loop':
      return true;
    default:
      return false;
  }
}

export function parseRoleFromDescription(
  description: string | undefined,
): ParsedRole {
  if (!description) return { kind: undefined, role: '' };

  const colonIdx = description.indexOf(':');
  if (colonIdx <= 0) {
    // No colon, or colon at index 0 → no parseable kind.
    return { kind: undefined, role: description.trim() };
  }

  const kindCandidate = description.slice(0, colonIdx).trim();
  const role = description.slice(colonIdx + 1).trim();

  if (isKnownKind(kindCandidate)) {
    return { kind: kindCandidate, role };
  }
  // Colon present but kind not recognized — treat the whole input as
  // a plain-text role to avoid silently dropping prefix text. This
  // is safer than guessing.
  return { kind: undefined, role: description.trim() };
}
