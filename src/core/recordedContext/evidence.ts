import { epochLocations } from 'agentfootprint';
import { readSourcePosition, object, own, id, path, samePath } from '../cursor/sourcePosition.js';
import { servedRowForEpoch } from '../served/servedRowAt.js';
import { verify } from '../served/verify.js';
import { collapsedTicketOf } from '../served/collapsedTicket.js';
import { presentationBudget } from './ownJson.js';
import type { RecordedContextView, RecordedToolInput } from './types.js';

/**
 * Root-log adapter only. Unsupported native mount logs stay explicitly unknown.
 * Never joins a StepNode result to a tool ID, or borrows a preceding model call.
 */
export function withRecordedEvidence(recording: unknown, context: RecordedContextView): RecordedContextView {
  const unavailable = (reason: string): RecordedToolInput => Object.freeze({ status: 'unavailable', reason });
  const budget = presentationBudget();
  let inspected = 0;
  let snapshot: unknown;
  let address: { logRunId: string; drillPath: readonly string[] } | undefined;
  let locations: ReturnType<typeof epochLocations> = [];
  const epochs = new Map<number, { count: number; location: ReturnType<typeof epochLocations>[number] }>();
  const claims = new Map<string, number>();
  // Logical labels cannot distinguish two claims on one physical log call.
  const claimKey = (call: RecordedContextView['calls'][number]): string => {
    const position = readSourcePosition(call.meta.sourcePosition);
    return JSON.stringify([position?.logRunId, position?.drillPath, call.meta.runtimeStageId, call.iteration]);
  };
  for (const call of context.calls) {
    const key = claimKey(call); claims.set(key, (claims.get(key) ?? 0) + 1);
  }
  try {
    snapshot = own(object(recording), 'snapshot');
    if (own(object(snapshot), 'stateValuesWithheld') === true)
      return Object.freeze({ ...context, toolInputs: Object.freeze(context.calls.map(() =>
        unavailable('native state values explicitly withheld'))) });
    const raw = object(own(object(snapshot), 'logAddress'));
    address = { logRunId: id(own(raw, 'logRunId')), drillPath: path(own(raw, 'drillPath')) };
    if (address.drillPath.length === 0) {
      locations = epochLocations(snapshot);
      for (const location of locations) {
        const prior = epochs.get(location.epoch);
        epochs.set(location.epoch, { count: (prior?.count ?? 0) + 1, location });
      }
    }
  } catch { /* A missing or malformed native address never supplies model-input evidence. */ }
  const toolInputs = context.calls.map((call): RecordedToolInput => {
    try {
      const position = readSourcePosition(call.meta.sourcePosition);
      if (!position) return unavailable('native source position unavailable');
      if (position.engineRunId !== call.meta.runId) return unavailable('native engine owner does not match');
      if (position.drillPath.length !== 0) return unavailable('nested native log adapter unavailable');
      if (!address || address.logRunId !== position.logRunId || !samePath(address.drillPath, position.drillPath))
        return unavailable('native log address does not match');
      const log = own(object(snapshot), 'commitLog');
      if (!Array.isArray(log) || position.committedThroughIdx >= log.length)
        return unavailable('native source prefix unavailable');
      const exact = epochs.get(call.iteration);
      if (!exact || exact.count !== 1 || exact.location.callRuntimeStageId !== call.meta.runtimeStageId ||
          claims.get(claimKey(call)) !== 1)
        return unavailable('exact model call unavailable or ambiguous');
      if (exact.location.subflowScope !== undefined || exact.location.callIdx <= position.committedThroughIdx)
        return unavailable('exact source-to-call position unavailable');
      if (++inspected > 128) return unavailable('model-input inspection limit');
      const row = servedRowForEpoch(snapshot, exact.location.epoch);
      if (!row || row.callRuntimeStageId !== call.meta.runtimeStageId)
        return unavailable('exact model call unavailable');
      if (row.receipt && row.receipt.basis.runId !== call.meta.runId)
        return unavailable('receipt run identity does not match');
      const checks = verify(row.view, row.receipt, call.meta.runId, row.receiptCause);
      const messages = row.view.messages.asSent.flatMap((message, index) => {
        if (message.role !== 'tool') return [];
        if (typeof message.toolCallId !== 'string' || !checks.messages[index])
          throw new Error('unreadable tool message');
        return [Object.freeze({ toolCallId: message.toolCallId, content: budget.own(message.content),
          ticket: collapsedTicketOf(message.content) !== undefined, status: checks.messages[index].status })];
      });
      const gaps = budget.own(row.view.gaps.map((gap) => `${gap.gap}: ${gap.why}`)) as readonly string[];
      return Object.freeze({ status: 'available', epoch: row.epoch, gaps, messages: Object.freeze(messages) });
    } catch { return unavailable('model-input evidence could not be read safely'); }
  });
  return Object.freeze({ ...context, toolInputs: Object.freeze(toolInputs) });
}

export function recordedModelInputLabel(status: 'verified' | 'reconstructed' | 'damaged' | 'not-on-record'): string {
  switch (status) {
    case 'verified': return 'Model-call input (verified receipt)';
    case 'reconstructed': return 'Rebuilt model input (unverified)';
    case 'damaged': return 'Rebuilt model input (damaged)';
    case 'not-on-record': return 'Model input not on record';
  }
}
