import type { StepNode } from 'agentfootprint/observe';
import { STORED_TOOL_RESULT_LABEL } from './toolResultLabels.js';

/**
 * Per-kind Input/Output sections. The user's mental model:
 *
 *   user→llm   — input: user message (carried via slot boundaries)
 *   llm→tool   — input: LLM's reasoning text · output: tool args (JSON)
 *   tool→llm   — input: tool result (JSON) → next LLM call
 *   llm→user   — output: final answer text
 *
 * Sections with no payload are omitted (adaptive — don't show empty rows).
 */
export function ioSectionsFor(
  node: StepNode,
): Array<{ label: string; payload: unknown }> {
  const out: Array<{ label: string; payload: unknown }> = [];
  switch (node.kind) {
    case 'llm->tool': {
      if (node.assistantText) {
        out.push({ label: "LLM's reasoning", payload: node.assistantText });
      }
      if (node.toolArgs !== undefined) {
        out.push({ label: 'Tool input (args)', payload: node.toolArgs });
      }
      break;
    }
    case 'tool->llm': {
      if (node.toolResult !== undefined) {
        out.push({ label: STORED_TOOL_RESULT_LABEL, payload: node.toolResult });
      }
      break;
    }
    case 'llm->user': {
      if (node.assistantText) {
        out.push({ label: 'Final answer', payload: node.assistantText });
      }
      break;
    }
    case 'user->llm':
    default:
      // No extra I/O sections for user→llm — the user message already
      // shows up via the `messages` slot boundary list inside the LLM
      // card; surfacing it again here would be redundant.
      break;
  }
  return out;
}
