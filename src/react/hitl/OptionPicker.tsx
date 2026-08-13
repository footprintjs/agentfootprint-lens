/**
 * <OptionPicker> — the shipped decision component (`'option-picker'`).
 *
 * A pick-one list. Options come from `props.options` (the small inline half)
 * or, when the ask shipped a `propsRef` claim ticket, from the resolved
 * artifact payload (`data`) — a 200-option table rides the STORE, not the
 * checkpoint, and this component neither knows nor cares which road the
 * options took.
 *
 * The click posts the option's `id` as the structured decision — the value
 * the asking tool documented it would receive — and the option's label as the
 * display sentence (`Chose "…"`). The label is words; the id is the record.
 *
 * Zero usable options is stated and still answerable: the picker renders the
 * plain answer box rather than an empty list, because a question with a
 * broken options payload is still a question a person must be able to answer.
 */

import React from 'react';
import { ensureLensStyles } from '../lensStyles.js';
import { PlainAnswerBox } from './AnswerBox.js';
import type { DecisionComponentProps } from './registry.js';

/** One option, normalized. */
interface PickerOption {
  readonly id: string;
  readonly label: string;
}

/** A string is its own id+label; an object contributes `id` (or `value`)
 *  and `label`. Anything unreadable is skipped, never invented. */
function normalizeOption(raw: unknown): PickerOption | undefined {
  if (typeof raw === 'string') return { id: raw, label: raw };
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as { id?: unknown; value?: unknown; label?: unknown };
  const idSource = o.id ?? o.value;
  const id =
    typeof idSource === 'string' ? idSource : typeof idSource === 'number' ? String(idSource) : undefined;
  const label = typeof o.label === 'string' ? o.label : id;
  if (id === undefined || label === undefined) return undefined;
  return { id, label };
}

/** Options from `props.options` first (inline half), else the resolved
 *  `propsRef` payload — either the array itself or `{ options: [...] }`. */
function readOptions(
  props: Readonly<Record<string, unknown>>,
  data: unknown,
): PickerOption[] {
  const candidates = [
    props.options,
    data,
    typeof data === 'object' && data !== null ? (data as { options?: unknown }).options : undefined,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const normalized = candidate
      .map(normalizeOption)
      .filter((o): o is PickerOption => o !== undefined);
    if (normalized.length > 0) return normalized;
  }
  return [];
}

export const OptionPicker: React.FC<DecisionComponentProps> = ({ props, data, respond }) => {
  ensureLensStyles();
  const options = React.useMemo(() => readOptions(props, data), [props, data]);

  if (options.length === 0) {
    return (
      <div data-testid="hitl-option-picker-empty">
        <p className="lens-hitl__state">
          This picker received no usable options (neither <code>props.options</code> nor the
          resolved <code>propsRef</code> payload carried a list) — answer in plain text
          instead.
        </p>
        <PlainAnswerBox respond={respond} />
      </div>
    );
  }

  return (
    <div className="lens-hitl__picker" data-testid="hitl-option-picker">
      <ul className="lens-hitl__options">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              data-testid={`hitl-option-${option.id}`}
              onClick={() => respond(option.id, `Chose "${option.label}".`)}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
