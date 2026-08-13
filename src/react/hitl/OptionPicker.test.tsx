/** @vitest-environment jsdom */
/**
 * <OptionPicker> — the shipped collector, pinned.
 *
 *   • options come from props.options OR the resolved propsRef payload (the
 *     array itself, or `{ options: [...] }`), inline winning;
 *   • strings and {id|value, label} objects normalize; junk is skipped,
 *     never invented;
 *   • the click posts the ID (the record); the label is only the sentence;
 *   • zero usable options is stated and still answerable via the plain box.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OptionPicker } from './OptionPicker.js';

function mount(props: Record<string, unknown>, data?: unknown) {
  const posted: { decision: unknown; sentence?: string }[] = [];
  render(
    <OptionPicker
      props={props}
      data={data}
      respond={(decision, sentence) => posted.push({ decision, sentence })}
    />,
  );
  return posted;
}

describe('<OptionPicker>', () => {
  it('posts the option id as the decision; the label rides only the sentence', () => {
    const posted = mount({ options: [{ id: 'opt-1', label: 'First reason' }] });
    fireEvent.click(screen.getByTestId('hitl-option-opt-1'));
    expect(posted).toEqual([{ decision: 'opt-1', sentence: 'Chose "First reason".' }]);
  });

  it('reads options from the resolved propsRef payload — array or { options }', () => {
    mount({}, ['a', 'b']);
    expect(screen.getByTestId('hitl-option-b')).toBeTruthy();
  });

  it('inline props.options win over resolved data; junk entries are skipped', () => {
    mount({ options: ['inline', 42, null, { value: 7, label: 'seven' }] }, ['store-only']);
    expect(screen.getByTestId('hitl-option-inline')).toBeTruthy();
    expect(screen.getByTestId('hitl-option-7').textContent).toBe('seven');
    expect(screen.queryByTestId('hitl-option-store-only')).toBeNull();
  });

  it('wrapped { options } payloads from the store are read too', () => {
    mount({}, { options: [{ id: 'w1', label: 'wrapped' }] });
    expect(screen.getByTestId('hitl-option-w1')).toBeTruthy();
  });

  it('zero usable options: stated, and the plain answer box keeps the human unblocked', () => {
    const posted = mount({ options: [null, 42] });
    expect(screen.getByTestId('hitl-option-picker-empty').textContent).toContain(
      'no usable options',
    );
    fireEvent.change(screen.getByTestId('hitl-answer-input'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByTestId('hitl-answer-submit'));
    expect(posted[0]!.decision).toBe('typed');
  });
});
