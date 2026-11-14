import React from 'react';
import { ensureLensStyles } from '../../lensStyles.js';
import type { TimeReplyForm, TimeReplyValues } from '../../../core/timeReply.js';
export interface TimeReplyFieldsProps {
  readonly form: TimeReplyForm;
  readonly values: TimeReplyValues;
  readonly onChange: (values: TimeReplyValues) => void;
  readonly disabled?: boolean;
}
/** Exact enum values/labels and unmodified text; the native reader owns their meaning. */
export function TimeReplyFields({ form, values, onChange, disabled = false }: TimeReplyFieldsProps): React.ReactElement {
  ensureLensStyles();
  const change = (id: string, other: string, value: string): void => {
    const entries = Object.entries(values).filter(([key]) => key !== id && key !== other);
    if (value.length > 0) entries.push([id, value]);
    onChange(Object.fromEntries(entries));
  };
  const text = (id: string): string => Object.prototype.hasOwnProperty.call(values, id) && typeof values[id] === 'string'
    ? values[id]! : '';
  return <div data-testid="time-reply-fields">
    {form.pairs.map(({ range, correction }) => <fieldset key={range.id} disabled={disabled}>
      <label>{range.description ?? range.id}
        <select disabled={range.choices.length === 0} className="lens-hitl__input" aria-label={range.description ?? range.id} value={text(range.id)}
          onChange={event => change(range.id, correction.id, event.target.value)}>
          <option value="">{range.choices.length === 0 ? 'No range choices supplied' : 'Choose a range'}</option>
          {range.choices.map((choice, index) => <option key={index} value={choice.value}>
            {choice.label ?? choice.value}
          </option>)}
        </select>
      </label>
      <span> or </span>
      <label>{correction.description ?? correction.id}
        <textarea className="lens-hitl__input" aria-label={correction.description ?? correction.id} value={text(correction.id)}
          onChange={event => change(correction.id, range.id, event.target.value)} />
      </label>
    </fieldset>)}
  </div>;
}
