/**
 * The DECISION component registry — how a paused run's typed question finds
 * its screen component.
 *
 * The no-eval law, applied to human-in-the-loop: an ask carries a
 * `componentId` plus props (small inline, or a `propsRef` claim ticket the
 * pane redeems through the artifact wire) — ids + props, never markup or code
 * the model wrote. The APP registers what each id renders; the model (or the
 * asking tool) can only nominate from vocabulary the app declared.
 *
 * A SEPARATE registry from the artifact-kind one, same law: artifact kinds
 * are the PRODUCER's vocabulary for "what this data is"; component ids are
 * the ASKER's vocabulary for "how this question is collected". One id, one
 * collector; conflating the maps would let a data kind summon an input
 * surface.
 *
 * One built-in ships: `'option-picker'` — a pick-one list whose options come
 * from `props.options` or from the resolved `propsRef` payload. Registered
 * components win over built-ins; an unknown id makes the pane fall back to
 * the prose question + a plain answer box, STATED (never a dead end, never
 * silently a different question).
 *
 * Module-level on purpose, exactly like the artifact registry: one page has
 * one vocabulary. Registration returns an unregister function for scoped
 * setups (tests, storybooks, hot reload).
 */

import type React from 'react';
import { OptionPicker } from './OptionPicker.js';

/** What every registered decision component receives. */
export interface DecisionComponentProps {
  /** The question in plain words, when the pause carried one. */
  readonly question?: string;
  /** The ask's small inline props, exactly as the asker declared them. */
  readonly props: Readonly<Record<string, unknown>>;
  /** The resolved `propsRef` payload (the big half — e.g. the options
   *  array), when the ask carried a ref and it resolved. `undefined` when
   *  there was no ref. The pane never renders the component with an
   *  unresolved ref — an expired ticket falls back to the honest
   *  placeholder + plain answer box instead. */
  readonly data?: unknown;
  /**
   * Post the person's answer — THE STRUCTURED DECISION, verbatim; it becomes
   * the record. For a consent gate (`checkIn` / middleware `ask`) respond
   * with the approve/decline vocabulary (`approveDecision` /
   * `declineDecision`); for a plain `askHuman`, whatever value the asking
   * tool documented.
   *
   * The optional `sentence` is the words the screen shows for the decision
   * ("Interact-to-NL") — display only, never the record; when omitted the
   * pane renders `decisionSentence(decision)`.
   */
  readonly respond: (decision: unknown, sentence?: string) => void;
}

/** One registered collector for one component id. */
export interface RegisterDecisionComponentArgs {
  /** The id askers nominate: `'option-picker'`, `'refund-form'`, … Exact
   *  match; ids are ids, not patterns. */
  readonly componentId: string;
  /** The React component that collects the answer. */
  readonly component: React.ComponentType<DecisionComponentProps>;
}

const registered = new Map<string, React.ComponentType<DecisionComponentProps>>();

/** The shipped collectors, consulted AFTER the app's registrations — so
 *  registering `'option-picker'` replaces the built-in one. */
const BUILT_IN = new Map<string, React.ComponentType<DecisionComponentProps>>([
  ['option-picker', OptionPicker],
]);

/**
 * Register a React component for a decision component id. Registering an id
 * again replaces the earlier component — the deliberate override door — and
 * the returned unregister function removes only the component it registered,
 * never a later replacement.
 */
export function registerDecisionComponent(args: RegisterDecisionComponentArgs): () => void {
  const componentId = typeof args?.componentId === 'string' ? args.componentId.trim() : '';
  if (componentId.length === 0) {
    throw new Error(
      'registerDecisionComponent needs `componentId` — the id asks nominate via ' +
        "askHuman({ component: { componentId } }) ('option-picker', 'refund-form'). The " +
        'registry keys on it; an empty id can never be nominated.',
    );
  }
  const component = args.component;
  if (typeof component !== 'function' && (component === null || typeof component !== 'object')) {
    throw new Error(
      `registerDecisionComponent('${componentId}') needs \`component\` — a React component ` +
        '(a function, or a memo/forwardRef object). Got ' +
        (component === null ? 'null' : typeof component) +
        '.',
    );
  }
  registered.set(componentId, component);
  return () => {
    if (registered.get(componentId) === component) registered.delete(componentId);
  };
}

/**
 * The collector for a component id: the app's registration first, then the
 * shipped built-ins, else `undefined` — at which point the pane falls back to
 * the prose question + plain answer box and SAYS so.
 */
export function decisionComponentFor(
  componentId: string,
): React.ComponentType<DecisionComponentProps> | undefined {
  return registered.get(componentId) ?? BUILT_IN.get(componentId);
}
