import type { TypedScope } from 'footprintjs';
import type { OpeningState } from '../types.js';
export const acceptContext = (scope: TypedScope<OpeningState>): void => { scope.disposition = 'accepted'; };
export const refuseContext = (scope: TypedScope<OpeningState>): void => { scope.disposition = 'refused'; };
