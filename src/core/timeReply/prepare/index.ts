import type { TypedScope } from 'footprintjs';
import { readTimeReplyInput } from '../read.js';
import { selectedTimeReply } from '../selection.js';
import type { SubmitCell, SubmitPorts, SubmitState } from '../chartTypes.js';
/** Keep request, values and the native reader in transient ports, never recorded arguments. */
export function prepareTimeReply(ports: SubmitPorts, cell: SubmitCell) {
  return (scope: TypedScope<SubmitState>): void => {
    const input = readTimeReplyInput(ports.awaiting, ports.reader);
    cell.answer = input.status === 'ready' ? selectedTimeReply(input.form, ports.values) : undefined;
    scope.ready = cell.answer !== undefined;
  };
}
