/**
 * <AwaitingPane> — the screen's half of a typed human-in-the-loop pause.
 *
 * Given the `awaiting` payload a served agent answered with (HTTP 202 body,
 * SSE `awaiting` event, or a stored session's `pending`), the pane:
 *
 *   1. reads the typed half via `readAwaitingComponent` (era-robust:
 *      `awaiting.component` first, then the three homes inside `pauseData`);
 *   2. redeems `propsRef` — the big half of the props — through the SAME
 *      {@link ArtifactResolver} every artifact rides, under the same session
 *      identity (a 200-option picker rides the store, not the checkpoint);
 *   3. renders the component the app REGISTERED for the id
 *      (`registerDecisionComponent`) — ids + props, never markup the model
 *      wrote (the no-eval law);
 *   4. hands the person's structured answer to `onDecision` — the lens does
 *      NOT own the wire POST; the host app does. `decisionRequestBody`
 *      formats the body it should post.
 *
 * Nothing on this road is allowed to dead-end the human:
 *   - unknown componentId    → the prose question + a plain answer box, and
 *                              the gap is STATED;
 *   - expired/missing ref    → the honest placeholder (the one
 *                              indistinguishable not-found) + the answer box;
 *   - resolver failure / none→ the door's own sentence + the answer box;
 *   - component crash        → stated + the answer box.
 *   Consent gates (`checkIn` / middleware `ask`) fall back to Approve/Decline
 *   + who-decided instead of a bare text box, because that is the vocabulary
 *   those gates are answered in — a bare string would bounce off the wire.
 *
 * "Interact-to-NL": after the person answers, the pane renders the decision
 * as ONE SENTENCE — display only. The record is the structured decision that
 * went to `onDecision`; the sentence is a rendering of that fact, never the
 * fact, and nothing ever parses it back.
 *
 * @example
 * ```tsx
 * const resolver = httpArtifactResolver({ url: '/invoke', sessionId });
 * <AwaitingPane
 *   awaiting={reply.awaiting}
 *   resolver={resolver}
 *   onDecision={(decision) =>
 *     fetch('/invoke', {
 *       method: 'POST',
 *       headers: { 'content-type': 'application/json' },
 *       body: JSON.stringify(decisionRequestBody({ decision, sessionId })),
 *     })
 *   }
 * />
 * ```
 */

import React from 'react';
import type { ArtifactResolver } from '../../core/artifacts/types.js';
import {
  decisionSentence,
  isConsentAsk,
  readAwaitingComponent,
} from '../../core/hitl/decision.js';
import type { AskComponentView, PendingAskView } from '../../core/hitl/types.js';
import { LensChartBoundary } from '../LensChartBoundary.js';
import { ensureLensStyles } from '../lensStyles.js';
import { ConsentAnswerBox, PlainAnswerBox } from './AnswerBox.js';
import { decisionComponentFor } from './registry.js';

export interface AwaitingPaneProps {
  /** The pending ask, exactly as the wire served it (`{ awaiting }` body /
   *  stored `pending`). Read structurally — any agentfootprint era's shape
   *  works, and a pre-9.24 payload simply renders its prose question. */
  readonly awaiting: PendingAskView;
  /**
   * How to redeem `component.propsRef` — `httpArtifactResolver` against the
   * served agent (session identity on every request) or
   * `storeArtifactResolver` for a same-process store. Only consulted when the
   * ask carries a ref; a pane for inline-props asks needs none.
   */
  readonly resolver?: ArtifactResolver;
  /**
   * Receives THE STRUCTURED DECISION when the person answers — the record.
   * The lens does not own the wire POST; the host app does. Format the body
   * with `decisionRequestBody({ decision, sessionId: awaiting.sessionId })`
   * and POST it to the same invoke URL conversation turns use.
   */
  readonly onDecision: (decision: unknown) => void;
  /** Prefill for "deciding as" on consent-gate fallbacks — an operator id
   *  the host app already knows. Never invented when absent. */
  readonly decidedBy?: string;
}

/** propsRef redemption state. `none` = the ask carried no ref. */
type RefState =
  | { readonly phase: 'none' }
  | { readonly phase: 'redeeming' }
  | { readonly phase: 'resolved'; readonly data: unknown }
  | { readonly phase: 'absent' }
  | { readonly phase: 'failed'; readonly message: string };

/** What the person's answer left behind — sentence for display, decision
 *  because the record is the fact the sentence renders. */
interface Answered {
  readonly decision: unknown;
  readonly sentence: string;
}

export const AwaitingPane: React.FC<AwaitingPaneProps> = ({
  awaiting,
  resolver,
  onDecision,
  decidedBy,
}) => {
  ensureLensStyles();
  const component: AskComponentView | undefined = readAwaitingComponent(awaiting);
  const propsRef = component?.propsRef;
  const [refState, setRefState] = React.useState<RefState>(
    propsRef === undefined ? { phase: 'none' } : { phase: 'redeeming' },
  );
  const [answered, setAnswered] = React.useState<Answered | undefined>(undefined);

  React.useEffect(() => {
    if (propsRef === undefined) {
      setRefState({ phase: 'none' });
      return;
    }
    if (!resolver) {
      setRefState({
        phase: 'failed',
        message:
          'this ask ships its options by ref, and no resolver was given to redeem it — pass ' +
          'resolver={httpArtifactResolver({ url, sessionId })}.',
      });
      return;
    }
    let alive = true;
    setRefState({ phase: 'redeeming' });
    resolver
      .get(propsRef)
      .then((resolution) => {
        if (!alive) return;
        if (resolution.status === 'live')
          setRefState({ phase: 'resolved', data: resolution.data });
        else if (resolution.status === 'absent') setRefState({ phase: 'absent' });
        else setRefState({ phase: 'failed', message: resolution.message });
      })
      .catch((err: unknown) => {
        // Resolvers return outcomes; this catches a hand-rolled one that
        // throws anyway, so the pane states it instead of white-screening.
        if (alive)
          setRefState({
            phase: 'failed',
            message: err instanceof Error && err.message ? err.message : String(err),
          });
      });
    return () => {
      alive = false;
    };
  }, [propsRef, resolver]);

  const respond = React.useCallback(
    (decision: unknown, sentence?: string): void => {
      setAnswered({ decision, sentence: sentence ?? decisionSentence(decision) });
      onDecision(decision);
    },
    [onDecision],
  );

  const consent = isConsentAsk(awaiting);
  const question = awaiting.question ?? awaiting.ask?.question;

  // The fallback answer surface — shaped by what the ask IS: consent gates
  // are answered in the approve/decline vocabulary, plain asks with a value.
  const fallbackBox = consent ? (
    <ConsentAnswerBox decidedBy={decidedBy} respond={respond} />
  ) : (
    <PlainAnswerBox respond={respond} />
  );

  // ── Answered: the sentence is display; the decision is the record. ──
  if (answered !== undefined) {
    return (
      <div className="lens-hitl__pane" data-testid="awaiting-pane">
        <p className="lens-hitl__sentence" data-testid="hitl-decision-sentence">
          {answered.sentence}
        </p>
        <p className="lens-hitl__note" data-testid="hitl-decision-record">
          Recorded decision: <code>{safeJson(answered.decision)}</code>
        </p>
      </div>
    );
  }

  const header =
    question !== undefined ? (
      <p className="lens-hitl__question" data-testid="hitl-question">
        {question}
      </p>
    ) : undefined;

  // ── No typed half: the prose question + answer box, as every era had. ──
  if (component === undefined) {
    return (
      <div className="lens-hitl__pane" data-testid="awaiting-pane">
        {header}
        {fallbackBox}
      </div>
    );
  }

  const Registered = decisionComponentFor(component.componentId);

  // ── Unknown componentId: state the gap, fall back — never a dead end. ──
  if (Registered === undefined) {
    return (
      <div className="lens-hitl__pane" data-testid="awaiting-pane">
        {header}
        <p className="lens-hitl__state" data-testid="hitl-unknown-component">
          This question nominated the component &lsquo;{component.componentId}&rsquo;, which is
          not registered on this screen —{' '}
          <code>
            registerDecisionComponent({'{'} componentId: &lsquo;{component.componentId}&rsquo;,
            component {'}'})
          </code>{' '}
          teaches Lens to collect with it. Answer below instead.
        </p>
        {fallbackBox}
      </div>
    );
  }

  // ── Ref still in flight: show the question, say what's happening. ──
  if (refState.phase === 'redeeming') {
    return (
      <div className="lens-hitl__pane" data-testid="awaiting-pane">
        {header}
        <p className="lens-hitl__state" data-testid="hitl-redeeming">
          Fetching this question&rsquo;s options ({propsRef})…
        </p>
      </div>
    );
  }

  // ── Expired/missing ref: the honest placeholder + answer box. ──
  if (refState.phase === 'absent') {
    return (
      <div className="lens-hitl__pane" data-testid="awaiting-pane">
        {header}
        <p className="lens-hitl__state" data-testid="hitl-ref-expired">
          The options this question shipped by ref ({propsRef}) have expired or are no longer
          available — answer below instead.
        </p>
        {fallbackBox}
      </div>
    );
  }

  // ── The door failed (or no resolver): its own sentence + answer box. ──
  if (refState.phase === 'failed') {
    return (
      <div className="lens-hitl__pane" data-testid="awaiting-pane">
        {header}
        <p className="lens-hitl__state" role="alert" data-testid="hitl-ref-failed">
          Could not fetch this question&rsquo;s options: {refState.message}
        </p>
        {fallbackBox}
      </div>
    );
  }

  // ── The typed question, rendered by the registered collector. ──
  return (
    <div className="lens-hitl__pane" data-testid="awaiting-pane">
      {header}
      <LensChartBoundary
        fallback={
          <div>
            <p className="lens-hitl__state" role="alert" data-testid="hitl-component-crashed">
              The component registered for &lsquo;{component.componentId}&rsquo; threw while
              rendering — answer below instead.
            </p>
            {fallbackBox}
          </div>
        }
      >
        <Registered
          question={question}
          props={component.props ?? {}}
          data={refState.phase === 'resolved' ? refState.data : undefined}
          respond={respond}
        />
      </LensChartBoundary>
    </div>
  );
};

/** The decision as compact JSON for the record line — reported, never
 *  approximated, when JSON cannot carry it. */
function safeJson(decision: unknown): string {
  try {
    return JSON.stringify(decision) ?? String(decision);
  } catch {
    return '[unserializable]';
  }
}
