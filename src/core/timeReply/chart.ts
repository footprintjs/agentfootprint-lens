import { flowChart } from 'footprintjs';
import { prepareTimeReply } from './prepare/index.js';
import { routeTimeReply } from './route/index.js';
import { submitTimeReply, refuseTimeReply } from './finish/index.js';
import type { SubmitPorts, SubmitCell, SubmitState, TimeReplySubmission } from './chartTypes.js';
/** Feature wiring only. Raw request/answer data stays in the transient ports/cell. */
export async function submitTimeReplyInput(ports: SubmitPorts): Promise<TimeReplySubmission> {
  const cell: SubmitCell = {};
  const chart = flowChart<SubmitState>('Prepare a time reply', prepareTimeReply(ports, cell), 'prepare-time-reply')
    .addDeciderFunction('Can submit the complete form?', routeTimeReply, 'time-reply-disposition')
    .addFunctionBranch('submit', 'Submit the declared selection', submitTimeReply(ports, cell))
    .addFunctionBranch('refuse', 'Keep the question unanswered', refuseTimeReply(cell))
    .end()
    .build();
  const trace = await chart.run({});
  return { status: cell.status!, trace };
}
