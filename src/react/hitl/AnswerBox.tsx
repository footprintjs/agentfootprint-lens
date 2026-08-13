/**
 * The plain answer surfaces every fallback path shares — a paused run is
 * NEVER a dead end for the human, whatever went wrong with the typed half.
 *
 * Two shapes, chosen by what the ask IS (not by what the screen happens to
 * have):
 *
 *  - `<PlainAnswerBox>` — a text box + Answer button for a plain `askHuman`
 *    pause. The typed text is the decision, verbatim.
 *  - `<ConsentAnswerBox>` — Approve / Decline + who-decided + note for a
 *    consent gate (`checkIn` / middleware `ask`). Those gates are answered
 *    with the structured approve/decline vocabulary; a bare string would be
 *    refused by the wire, so the fallback collects the RIGHT shape instead of
 *    a shape that bounces. `by` is required before the buttons enable — an
 *    audit record with no actor is the silently-wrong record consent gates
 *    exist to prevent.
 */

import React from 'react';
import { approveDecision, declineDecision } from '../../core/hitl/decision.js';
import { ensureLensStyles } from '../lensStyles.js';

export interface PlainAnswerBoxProps {
  /** Post the decision (the typed text, verbatim). Second arg is the
   *  display sentence. */
  readonly respond: (decision: unknown, sentence?: string) => void;
}

/** Text box + Answer button — the decision is the typed text. */
export const PlainAnswerBox: React.FC<PlainAnswerBoxProps> = ({ respond }) => {
  ensureLensStyles();
  const [text, setText] = React.useState('');
  const submit = (): void => {
    respond(text, `Answered: "${text}".`);
  };
  return (
    <div className="lens-hitl__answer" data-testid="hitl-answer-box">
      <input
        className="lens-hitl__input"
        data-testid="hitl-answer-input"
        type="text"
        value={text}
        placeholder="Your answer"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <button type="button" data-testid="hitl-answer-submit" onClick={submit}>
        Answer
      </button>
    </div>
  );
};

export interface ConsentAnswerBoxProps {
  /** Prefill for "deciding as" — an operator id the host app already knows.
   *  The person can still edit it; it cannot be invented here. */
  readonly decidedBy?: string;
  /** Post the structured consent decision. */
  readonly respond: (decision: unknown, sentence?: string) => void;
}

/** Approve / Decline + who + note — the consent vocabulary, collected right. */
export const ConsentAnswerBox: React.FC<ConsentAnswerBoxProps> = ({ decidedBy, respond }) => {
  ensureLensStyles();
  const [by, setBy] = React.useState(decidedBy ?? '');
  const [note, setNote] = React.useState('');
  const ready = by.trim().length > 0;
  const answer = (approved: boolean): void => {
    const input = { by: by.trim(), ...(note.trim().length > 0 && { note: note.trim() }) };
    respond(approved ? approveDecision(input) : declineDecision(input));
  };
  return (
    <div className="lens-hitl__answer lens-hitl__answer--consent" data-testid="hitl-consent-box">
      <input
        className="lens-hitl__input"
        data-testid="hitl-consent-by"
        type="text"
        value={by}
        placeholder="Deciding as (your id — required)"
        onChange={(e) => setBy(e.target.value)}
      />
      <input
        className="lens-hitl__input"
        data-testid="hitl-consent-note"
        type="text"
        value={note}
        placeholder="Note (optional; shown to the model on decline)"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="lens-hitl__consent-buttons">
        <button
          type="button"
          data-testid="hitl-consent-approve"
          disabled={!ready}
          onClick={() => answer(true)}
        >
          Approve
        </button>
        <button
          type="button"
          data-testid="hitl-consent-decline"
          disabled={!ready}
          onClick={() => answer(false)}
        >
          Decline
        </button>
      </div>
      {!ready && (
        <p className="lens-hitl__note" data-testid="hitl-consent-needs-by">
          Say who is deciding — the decision is an audit record, and a record with no actor
          names nobody.
        </p>
      )}
    </div>
  );
};
