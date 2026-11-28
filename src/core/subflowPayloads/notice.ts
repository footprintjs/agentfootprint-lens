import type { StepPayload } from './types.js';

/**
 * The one sentence a view shows for a payload it cannot show, when that
 * payload lives with its sub-flow invocation. `none` has no sentence here:
 * each view says "none recorded" in its own words, and only for `none`.
 */
export function payloadNotice(payload: Extract<StepPayload, { state: 'not-loaded' | 'unavailable' }>): string {
  if (payload.state === 'unavailable') return `Unavailable: ${payload.reason}. It is stored with its sub-flow invocation, which could not supply it.`;
  switch (payload.why) {
    case 'not-requested': return 'Not loaded yet. It is stored with its sub-flow invocation.';
    case 'loading': return 'Loading. It is stored with its sub-flow invocation.';
    case 'load-failed': return 'Not loaded: its sub-flow invocation could not be loaded.';
    case 'not-sent': return 'Not loaded: the reply for its sub-flow invocation did not include it.';
    case 'no-source': return 'Not loaded: it is stored with its sub-flow invocation, which this view cannot load.';
  }
}

/** True when a payload is neither shown nor "none recorded". */
export function isWithheld(payload: StepPayload): payload is Extract<StepPayload, { state: 'not-loaded' | 'unavailable' }> {
  return payload.state === 'not-loaded' || payload.state === 'unavailable';
}
