import type { PendingAskView } from '../../../core/hitl/types.js';
import { readAwaitingComponent } from '../../../core/hitl/decision.js';
import { awaitingInputOf } from '../../../core/time/awaitingInput.js';
import { ownAskData, readAskMetadata } from '../../../core/time/askMetadata.js';
import type { TimeReplyInput } from '../../../core/timeReply.js';
/** Local lifecycle comparison only; never a record id, DOM key or chart argument. */
export function timeAskGeneration(awaiting: PendingAskView, reply: TimeReplyInput): readonly unknown[] {
  const request = awaitingInputOf(awaiting);
  let metadata: string;
  let context: unknown;
  try {
    const frame = request !== undefined ? readAskMetadata(request, field => typeof ownAskData(field, 'format') === 'string') : undefined;
    context = ownAskData(request, 'context'); // Opaque revision identity; never inspect reserved keys.
    const pairs = reply.status === 'ready'
      ? { status: reply.status, complete: reply.form.complete,
        pairs: reply.form.pairs }
      : reply;
    metadata = JSON.stringify([frame, pairs]);
  } catch { metadata = 'unavailable'; }
  const component = readAwaitingComponent(awaiting);
  return [request ?? awaiting.pauseData ?? awaiting, context, metadata, awaiting.sessionId,
    awaiting.question, component?.componentId, component?.propsRef, component?.props];
}
