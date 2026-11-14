import { decide, type TypedScope } from 'footprintjs';
import type { SubmitState } from '../chartTypes.js';
export const TIME_REPLY_SUBMIT_RULES = [{ when: (state: SubmitState) => state.ready,
  then: 'submit', label: 'The native declaration and explicit field selection cover the complete form' }];
export const routeTimeReply = (scope: TypedScope<SubmitState>) => decide(scope, TIME_REPLY_SUBMIT_RULES, 'refuse');
