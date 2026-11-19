import { presentationBudget } from './recordedContext/ownJson.js';

export interface ToolArgumentDisplay {
  readonly toolArgs?: Record<string, unknown>;
  readonly hiddenArgs?: readonly string[];
}

/** Undefined permits legacy args. Even an unreadable display field closes that fallback. */
export function protectedToolArguments(payload: object): ToolArgumentDisplay | undefined {
  const shown = Object.getOwnPropertyDescriptor(payload, 'shownArgs');
  const hidden = Object.getOwnPropertyDescriptor(payload, 'hiddenArgs');
  if (!shown && !hidden) return undefined;

  const budget = presentationBudget();
  let hiddenArgs: readonly string[] | undefined;
  try {
    if (hidden) {
      const names = hidden.enumerable && 'value' in hidden ? budget.own(hidden.value) : undefined;
      if (!Array.isArray(names) || !names.every(name => typeof name === 'string')) return {};
      hiddenArgs = names;
    }
    if (shown?.enumerable && 'value' in shown) {
      const value = budget.own(shown.value);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return { toolArgs: value as Record<string, unknown>, ...(hiddenArgs && { hiddenArgs }) };
      }
    }
  } catch {
    // An invalid display must never send presentation code back to the raw arguments.
  }
  return hiddenArgs ? { hiddenArgs } : {};
}

export function describeToolArguments(display: ToolArgumentDisplay): string {
  const shown = display.toolArgs === undefined ? '' : ` Shown arguments: ${JSON.stringify(display.toolArgs)}.`;
  const hidden = display.hiddenArgs?.length ? ` Hidden arguments: ${display.hiddenArgs.join(', ')}.` : '';
  return shown + hidden;
}
