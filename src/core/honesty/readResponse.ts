import { object, own } from '../cursor/sourcePosition.js';

type Response =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'unavailable' | 'ambiguous-marker' };

function redactionPolicy(recording: unknown, runId: string): 'covered' | 'uncovered' | 'unknown' {
  try {
    const snapshot = object(own(object(recording), 'snapshot'));
    if (own(snapshot, 'runId') !== runId) return 'unknown';
    const recorders = own(snapshot, 'recorders');
    if (!Array.isArray(recorders)) return 'unknown';
    const length = own(recorders, 'length');
    if (typeof length !== 'number' || length > 64) return 'unknown';
    for (let index = 0; index < length; index++) {
      const recorder = object(own(recorders, String(index)));
      const id = own(recorder, 'id');
      if (id === 'agentfootprint.redaction') return 'covered';
      if (typeof id !== 'string' || id === '') return 'unknown';
    }
    return 'uncovered';
  } catch {
    return 'unknown';
  }
}

/** The record can span multiple runs, while its snapshot describes only one. */
export function readResponse(recording: unknown, runId: string, value: unknown): Response {
  if (typeof value !== 'string') return { kind: 'unavailable' };
  if (value === '[REDACTED]' || value === 'REDACTED') {
    const policy = redactionPolicy(recording, runId);
    if (policy === 'covered') return { kind: 'unavailable' };
    if (policy === 'unknown') return { kind: 'ambiguous-marker' };
  }
  return { kind: 'text', text: value };
}
