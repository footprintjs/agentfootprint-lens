import type { TypedScope } from 'footprintjs';
import type { SubmitCell, SubmitPorts, SubmitState } from '../chartTypes.js';
export function submitTimeReply(ports: SubmitPorts, cell: SubmitCell) {
  return async (scope: TypedScope<SubmitState>): Promise<void> => {
    try {
      await ports.onAnswer(cell.answer!);
      cell.status = 'handed-off'; scope.disposition = 'handed-off';
    } catch {
      // A host exception can contain a request or correction. It never enters the trace.
      cell.status = 'unconfirmed'; scope.disposition = 'host-outcome-unconfirmed';
    }
  };
}
export const refuseTimeReply = (cell: SubmitCell) => (scope: TypedScope<SubmitState>): void => {
  cell.status = 'refused'; scope.disposition = 'selection-unavailable';
};
