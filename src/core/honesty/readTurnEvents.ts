import { object, own, readSourcePosition, type SourcePosition } from '../cursor/sourcePosition.js';

const turnStartType = 'agentfootprint.agent.turn_start';
const turnEndType = 'agentfootprint.agent.turn_end';

export interface HonestyEventAddress {
  /** Zero-based index in the original recording. Times and stage IDs can repeat. */
  readonly eventIndex: number;
  readonly runtimeStageId?: string;
  readonly sourcePosition?: SourcePosition;
}

export interface RecordedTurnEvent {
  readonly type: string;
  readonly payload: object;
  readonly address: HonestyEventAddress;
}

export type RecordedTurnRead =
  | { readonly status: 'ready'; readonly events: readonly RecordedTurnEvent[] }
  | { readonly status: 'before-turn' | 'not-collected' | 'too-long' | 'unreadable' };

/**
 * Read one recorded invocation through an inclusive event ordinal.
 * A different invocation can reuse both the turn number and provider call IDs.
 * Refuse an unreadable prefix before a view can describe missing facts.
 */
export function readTurnEvents(
  recording: unknown,
  startEventIndex: number,
  throughEventIndex: number | undefined,
  maxEvents: number,
): RecordedTurnRead {
  try {
    const rawEvents = own(object(recording), 'events');
    if (rawEvents === undefined || rawEvents === null) return { status: 'not-collected' };
    if (!Array.isArray(rawEvents)) return { status: 'unreadable' };
    const length = own(rawEvents, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
      return { status: 'unreadable' };
    }
    if (length > maxEvents) return { status: 'too-long' };
    const through = throughEventIndex ?? length - 1;
    if (!Number.isSafeInteger(startEventIndex) || startEventIndex < 0 || startEventIndex >= length ||
        !Number.isSafeInteger(through) || through < -1 || through >= length) {
      return { status: 'unreadable' };
    }
    if (through < startEventIndex) return { status: 'before-turn' };

    const start = object(own(rawEvents, String(startEventIndex)));
    if (own(start, 'type') !== turnStartType) return { status: 'unreadable' };
    const startPayload = object(own(start, 'payload'));
    const turnIndex = own(startPayload, 'turnIndex');
    const runId = own(object(own(start, 'meta')), 'runId');
    if (typeof turnIndex !== 'number' || !Number.isSafeInteger(turnIndex) || turnIndex < 0 ||
        typeof runId !== 'string' || runId === '') {
      return { status: 'unreadable' };
    }

    const events: RecordedTurnEvent[] = [];
    for (let index = startEventIndex; index <= through; index++) {
      const event = object(own(rawEvents, String(index)));
      const type = own(event, 'type');
      if (typeof type !== 'string') return { status: 'unreadable' };
      const meta = object(own(event, 'meta'));
      // An independent child invocation writes its own start and finish.
      if (own(meta, 'runId') !== runId) continue;
      if (type === turnStartType && index !== startEventIndex) break;
      const payload = object(own(event, 'payload'));
      if (type === turnEndType && own(payload, 'turnIndex') !== turnIndex) continue;
      const runtimeStageId = own(meta, 'runtimeStageId');
      const sourcePosition = readSourcePosition(own(meta, 'sourcePosition'));
      events.push({
        type,
        payload,
        address: {
          eventIndex: index,
          ...(typeof runtimeStageId === 'string' && runtimeStageId !== '' && { runtimeStageId }),
          ...(sourcePosition !== undefined && { sourcePosition }),
        },
      });
      if (type === turnEndType) break;
    }
    return { status: 'ready', events };
  } catch {
    return { status: 'unreadable' };
  }
}
