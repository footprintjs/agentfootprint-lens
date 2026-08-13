/** @vitest-environment jsdom */
/**
 * The decision component registry — the no-eval law's HITL bookkeeping.
 *
 * Pinned: ids resolve to registered components; the shipped 'option-picker'
 * answers when nothing is registered; a registration OVERRIDES the built-in
 * and its unregister restores it; an unknown id resolves to undefined (the
 * pane then falls back, stated); malformed registrations are refused with a
 * teaching sentence, never accepted and silently wrong.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { OptionPicker } from './OptionPicker.js';
import {
  decisionComponentFor,
  registerDecisionComponent,
  type DecisionComponentProps,
} from './registry.js';

const Custom: React.FC<DecisionComponentProps> = () => <div>custom</div>;

describe('registerDecisionComponent / decisionComponentFor', () => {
  it('resolves a registered component by exact id', () => {
    const unregister = registerDecisionComponent({ componentId: 'refund-form', component: Custom });
    try {
      expect(decisionComponentFor('refund-form')).toBe(Custom);
    } finally {
      unregister();
    }
    expect(decisionComponentFor('refund-form')).toBeUndefined();
  });

  it("ships 'option-picker' → OptionPicker as a built-in, overridable by registration", () => {
    expect(decisionComponentFor('option-picker')).toBe(OptionPicker);
    const unregister = registerDecisionComponent({
      componentId: 'option-picker',
      component: Custom,
    });
    try {
      expect(decisionComponentFor('option-picker')).toBe(Custom);
    } finally {
      unregister();
    }
    expect(decisionComponentFor('option-picker')).toBe(OptionPicker);
  });

  it('resolves an unknown id to undefined — the pane states the gap and falls back', () => {
    expect(decisionComponentFor('mystery-widget')).toBeUndefined();
  });

  it('unregister removes only its own registration, never a later replacement', () => {
    const first = registerDecisionComponent({ componentId: 'x', component: Custom });
    const Replacement: React.FC<DecisionComponentProps> = () => <div>replacement</div>;
    const second = registerDecisionComponent({ componentId: 'x', component: Replacement });
    first(); // stale unregister — must not remove the replacement
    expect(decisionComponentFor('x')).toBe(Replacement);
    second();
    expect(decisionComponentFor('x')).toBeUndefined();
  });

  it('refuses a blank id and a non-component, teaching what each must be', () => {
    expect(() => registerDecisionComponent({ componentId: '  ', component: Custom })).toThrow(
      /needs `componentId`/,
    );
    expect(() =>
      registerDecisionComponent({ componentId: 'x', component: null as never }),
    ).toThrow(/needs `component`/);
  });
});
