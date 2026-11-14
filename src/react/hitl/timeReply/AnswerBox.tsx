import React, { useEffect, useRef, useState } from 'react';
import { selectedTimeReply, submitTimeReplyInput, type TimeReplyForm, type TimeReplyReader, type TimeReplyValues } from '../../../core/timeReply.js';
import { TimeReplyFields } from './Fields.js';
export function TimeReplyUnavailable({ incomplete = false }: { readonly incomplete?: boolean }): React.ReactElement {
  return <p role="alert" data-testid="time-reply-unavailable">{incomplete
    ? 'This view cannot collect every field in this question. Use the host’s complete form.'
    : 'The time correction fields could not be read safely. Request a fresh question from the host.'}</p>;
}
/** Only used when these controls cover the complete native form. No wire POST lives here. */
export function TimeReplyAnswerBox({ awaiting, reader, form, respond }: {
  readonly awaiting: unknown;
  readonly reader: TimeReplyReader;
  readonly form: TimeReplyForm;
  readonly respond: (decision: unknown) => void | Promise<void>;
}): React.ReactElement {
  const [values, setValues] = useState<TimeReplyValues>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const submit = async (): Promise<void> => {
    if (submitting.current || selectedTimeReply(form, values) === undefined) return;
    submitting.current = true;
    setPending(true); setFailed(false);
    try {
      const result = await submitTimeReplyInput({ awaiting, reader, values, onAnswer: async answer => {
        if (!alive.current) throw Error('The question changed.');
        await respond(answer);
      } });
      if (alive.current) setFailed(result.status !== 'submitted');
    } catch { if (alive.current) setFailed(true); }
    finally { submitting.current = false; if (alive.current) setPending(false); }
  };
  return <div className="lens-hitl__answer" data-testid="time-reply-answer">
    <TimeReplyFields form={form} values={values} onChange={setValues} disabled={pending} />
    <button type="button" disabled={pending || selectedTimeReply(form, values) === undefined}
      onClick={() => { void submit(); }}>Answer</button>
    {failed && <p role="alert">The time answer could not be submitted. The question remains unanswered.</p>}
  </div>;
}
