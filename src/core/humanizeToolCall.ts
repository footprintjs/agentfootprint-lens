import type { Payloads } from 'agentfootprint/events';
import { presentationBudget } from './recordedContext/ownJson.js';

/** The display proposal and execution evidence serve different audiences. */
export function humanizeToolCall(payload: Payloads.ToolStartPayload): string {
  const call = `Calling tool "${payload.toolName}"`;
  const shown = Object.getOwnPropertyDescriptor(payload, 'shownArgs');
  const hidden = Object.getOwnPropertyDescriptor(payload, 'hiddenArgs');
  if (!shown && !hidden) return `${call} with ${JSON.stringify(payload.args)}.`;

  // A protected or malformed proposal must never fall back to the actual args.
  if (shown?.enumerable && 'value' in shown) {
    try {
      const budget = presentationBudget();
      if (hidden) {
        const names = hidden.enumerable && 'value' in hidden ? budget.own(hidden.value) : undefined;
        if (!Array.isArray(names) || !names.every(name => typeof name === 'string')) return `${call}.`;
      }
      const display = budget.own(shown.value);
      if (typeof display === 'object' && display !== null && !Array.isArray(display)) {
        return `${call} with ${JSON.stringify(display)}.`;
      }
    } catch {
      // Saved data can exceed the presentation budget or contain non-JSON fields.
    }
  }
  return `${call}.`;
}
