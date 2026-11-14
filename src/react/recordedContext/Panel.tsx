import React, { useState } from 'react';
import { contextCallLabel, recordedModelInputLabel, type RecordedContextView, type RecordedToolInput } from '../../core/recordedContext.js';
import { T } from '../theme/index.js';

/** Disclosure state belongs to the view; recorded values stay in the one model. */
export function RecordedContextPanel({ view }: { readonly view: RecordedContextView }): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const show = (id: string, open: boolean): void => setExpanded((previous) => {
    if (previous.has(id) === open) return previous;
    const next = new Set(previous);
    if (open) next.add(id); else next.delete(id);
    return next;
  });
  const references = (ids: readonly string[]): React.ReactNode => ids.length === 0 ? 'none' :
    ids.map((id, occurrence) => <React.Fragment key={occurrence}>
      {occurrence > 0 && ', '}
      <button type="button" onClick={() => show(id, true)} aria-label={`Expand context piece ${id}`}>
        {id}
      </button>
    </React.Fragment>);
  return <section aria-label="Recorded context" style={{
    fontFamily: T.fontSans, color: T.textPrimary, background: T.bgElevated,
    border: `1px solid ${T.border}`, borderRadius: 6, padding: 12, marginBottom: 12,
  }}>
    <h2 style={{ fontSize: 14 }}>Recorded context dictionary</h2>
    <p>Each piece is stored once. Expand a reference to read its exact stored value.</p>
    {view.dictionary.map((piece) => <details key={piece.id} open={expanded.has(piece.id)}
      onToggle={(event) => show(piece.id, event.currentTarget.open)} data-context-id={piece.id}>
      <summary>{piece.id}</summary>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: T.fontMono }}>
        {typeof piece.value === 'string' ? piece.value : JSON.stringify(piece.value, null, 2)}
      </pre>
    </details>)}
    <h2 style={{ fontSize: 14 }}>Context by call</h2>
    {view.calls.map((call, index) => <article key={index} aria-label={contextCallLabel(call)}>
      <h3 style={{ fontSize: 12 }}>{contextCallLabel(call)}</h3>
      {call.added.length === 0 && call.removed.length === 0
        ? <p>{call.order !== undefined ? 'Recorded context order changed' : 'Recorded context unchanged'} · {call.unchanged} pieces.</p>
        : <><div>Added: {references(call.added)}</div><div>Removed: {references(call.removed)}</div>
          <div>Unchanged: {call.unchanged}</div></>}
      <div>Recorded counts: {JSON.stringify(call.counts)}</div>
      <details><summary>Call coordinates</summary>
        <div>Stage: {call.meta.runtimeStageId ?? 'not recorded'}</div>
        <div>Composition: {JSON.stringify(call.meta.compositionPath ?? [])}</div>
        <div>Iteration: {call.iteration}</div>
        <div>Source event index: {call.eventIndex}</div>
        {call.order !== undefined && <div>Recorded order: {JSON.stringify(call.order)}</div>}
      </details>
      <ToolInputs evidence={view.toolInputs?.[index]} />
    </article>)}
    {view.droppedEvents !== undefined && <p>Dropped events: {view.droppedEvents}</p>}
    {view.firstRetainedEventIndex !== undefined &&
      <p>First retained event index: {view.firstRetainedEventIndex}</p>}
  </section>;
}

function ToolInputs({ evidence }: { readonly evidence: RecordedToolInput | undefined }): React.ReactElement | null {
  if (evidence === undefined) return null;
  if (evidence.status === 'unavailable')
    return <p>Exact model-input evidence unavailable: {evidence.reason}.</p>;
  return <div aria-label="Tool messages for this exact model call">
    <p>Model-call input is separate from the stored tool result.</p>
    {evidence.messages.length === 0 && <p>No readable tool messages in this call view.</p>}
    {evidence.messages.map((message, index) => <details key={index}>
      <summary>{recordedModelInputLabel(message.status)} · {message.toolCallId}
        {message.ticket && ' · ticket-shaped input'}</summary>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
      </pre>
    </details>)}
    {evidence.gaps.map((gap, index) => <p key={index}>Input gap: {gap}</p>)}
  </div>;
}
