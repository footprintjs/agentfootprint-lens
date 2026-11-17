import React from 'react';
import type { RecordedInvocation } from '../../core/recordingSourceCodec/index.js';
import { T } from '../theme/index.js';

const button: React.CSSProperties = { padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: 6, background: T.bgSecondary, color: T.textPrimary, font: 'inherit', cursor: 'pointer' };

/** Metadata and pending presentation; no request, cursor or recording state. */
export function RecordingSourceView({ path, childCount, pending, preparing, failed, open, query, choices, count,
  currentRequest, heldRequest, onToggle, onQuery, onChoose, onCancel, onRoot }: {
  readonly path: readonly string[]; readonly childCount: number; readonly pending: boolean; readonly preparing: boolean;
  readonly failed: boolean; readonly open: boolean; readonly query: string; readonly choices: readonly RecordedInvocation[];
  readonly count: number; readonly onToggle: () => void; readonly onQuery: (value: string) => void;
  readonly currentRequest?: RecordedInvocation; readonly heldRequest?: RecordedInvocation;
  readonly onChoose: (request: RecordedInvocation) => void; readonly onCancel: () => void; readonly onRoot: () => void;
}) {
  return <section aria-label="Recorded subflow loading" style={{ padding: '8px 12px', color: T.textPrimary, fontSize: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span>{path.length === 0 ? 'Root recording' : `Recorded scope: ${path[path.length - 1]}`}</span>
      {path.length > 0 && <button style={button} type="button" onClick={onRoot}>Root recording</button>}
      {currentRequest !== undefined && !pending && <button style={button} type="button" onClick={() => onChoose(currentRequest)}>Load this recorded scope</button>}
      {heldRequest !== undefined && !pending && <button style={button} type="button" onClick={() => onChoose(heldRequest)}>Open the held recorded scope</button>}
      {childCount > 0 && <button style={button} type="button" aria-expanded={open} onClick={onToggle}>Recorded subflows ({childCount})</button>}
      {pending && <><span role="status">{preparing ? 'Preparing recorded subflow…' : 'Loading recorded subflow…'}</span><button style={button} type="button" onClick={onCancel}>Cancel loading</button></>}
    </div>
    {failed && <p role="status">This recorded subflow could not be opened. Choose it again to retry.</p>}
    {open && <div>
      <label>Find a recorded invocation <input style={{ ...button, cursor: 'text' }} aria-label="Find a recorded invocation" value={query} onChange={event => onQuery(event.target.value)} /></label>
      <p>{choices.length} of {count} matching recorded invocations. Choosing one loads only that exact invocation.</p>
      <ul style={{ paddingLeft: 16 }}>{choices.map(request => <li key={JSON.stringify(request.invocationPath)}>
        <button type="button" onClick={() => onChoose(request)} style={{ ...button, maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'left' }}
          aria-label={`Open recorded invocation ${request.invocationPath.join(' → ')}`}>{request.mountRuntimeStageId}</button>
      </li>)}</ul>
    </div>}
  </section>;
}
