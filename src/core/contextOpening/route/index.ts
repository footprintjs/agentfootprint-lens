import { decide, type TypedScope } from 'footprintjs';
import type { OpeningState } from '../types.js';
/** Refusal policy is data; no values or private error strings enter a decision. */
export const OPENING_RULES = [{ then: 'accept', when: (state: OpeningState) => state.admitted,
  label: 'The recording query admitted the input' }];
export const routeContext = (scope: TypedScope<OpeningState>) => decide(scope, OPENING_RULES, 'refuse');
