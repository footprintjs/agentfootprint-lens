import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { samePath, type SourcePosition } from '../../core/cursor/sourcePosition.js';
import type { HonestyEventAddress } from '../../core/honesty/readTurnEvents.js';
import type { SourceAwareSharedCursor } from '../useSharedCursor.js';
import { HonestyLensPanel, type HonestyLensPanelProps } from './HonestyLensPanel.js';

export interface HonestyLensRoundTripProps extends Omit<HonestyLensPanelProps, 'onInspect'> {
  readonly cursor: Pick<SourceAwareSharedCursor, 'selectSourcePrefix' | 'target'>;
  /** Render the host's Why or Flow view using the same shared cursor. */
  readonly renderEvidence: (address: HonestyEventAddress) => ReactNode;
  /** Defaults to the document scroll element. Supply the answer's scroller for a nested host. */
  readonly getAnswerScroller?: () => Element | null;
}

interface Visit {
  readonly inspecting: boolean;
  readonly address: HonestyEventAddress;
  readonly position: SourcePosition;
  readonly trigger: HTMLButtonElement | null;
  readonly scroll: { readonly element: Element; readonly top: number; readonly left: number } | undefined;
}

function samePosition(a: SourcePosition, b: SourcePosition): boolean {
  return a.engineRunId === b.engineRunId && a.logRunId === b.logRunId
    && a.committedThroughIdx === b.committedThroughIdx && samePath(a.drillPath, b.drillPath);
}

export function HonestyLensRoundTrip(props: HonestyLensRoundTripProps) {
  return <TurnRoundTrip key={props.turnKey} {...props} />;
}

function TurnRoundTrip({ cursor, renderEvidence, getAnswerScroller, ...panel }: HonestyLensRoundTripProps) {
  const [visit, setVisit] = useState<Visit>();
  const [unavailable, setUnavailable] = useState(false);
  const answer = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const clicked = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (visit === undefined) return;
    if (visit.inspecting) {
      back.current?.focus();
      return;
    }
    const { trigger } = visit;
    if (trigger !== null && answer.current?.contains(trigger) && !trigger.disabled) {
      trigger.focus({ preventScroll: true });
    }
    if (trigger === null || trigger.ownerDocument.activeElement !== trigger) {
      answer.current?.querySelector('button')?.focus({ preventScroll: true });
    }
    if (visit.scroll?.element.isConnected) {
      visit.scroll.element.scrollTop = visit.scroll.top;
      visit.scroll.element.scrollLeft = visit.scroll.left;
    }
  }, [visit]);

  function inspect({ address }: { readonly address: HonestyEventAddress }) {
    const trigger = clicked.current;
    clicked.current = null;
    if (address.sourcePosition === undefined) {
      setUnavailable(true);
      return;
    }
    const scroller = getAnswerScroller === undefined ? document.scrollingElement : getAnswerScroller();
    const scroll = scroller == null ? undefined : {
      element: scroller, top: scroller.scrollTop, left: scroller.scrollLeft,
    };
    const resolved = cursor.selectSourcePrefix(address.sourcePosition);
    setUnavailable(resolved.status !== 'available');
    if (resolved.status !== 'available') return;
    setVisit({
      inspecting: true,
      address: {
        eventIndex: address.eventIndex,
        ...(address.runtimeStageId !== undefined && { runtimeStageId: address.runtimeStageId }),
        sourcePosition: resolved.position,
      },
      position: resolved.position,
      trigger,
      scroll,
    });
  }

  const target = cursor.target;
  const moved = visit !== undefined && (target?.kind !== 'source-prefix' || !samePosition(target.position, visit.position));

  function returnToOriginalStep() {
    if (visit === undefined) return;
    const resolved = cursor.selectSourcePrefix(visit.position);
    setUnavailable(resolved.status !== 'available');
    if (resolved.status === 'available') setVisit({ ...visit, inspecting: true });
  }

  return <>
    <div ref={answer} hidden={visit?.inspecting === true} onClickCapture={event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      clicked.current = button instanceof HTMLButtonElement && event.currentTarget.contains(button) ? button : null;
    }}>
      <HonestyLensPanel {...panel} onInspect={inspect} />
      {unavailable && <p role="status" aria-label="Evidence position">This position in the record is unavailable.</p>}
      {moved && <button type="button" onClick={returnToOriginalStep}>Return to original step</button>}
    </div>
    {visit?.inspecting === true && (
      <section aria-label="Recorded evidence">
        <button type="button" ref={back} onClick={() => setVisit({ ...visit, inspecting: false })}>
          Back to answer
        </button>
        {renderEvidence(visit.address)}
      </section>
    )}
  </>;
}
