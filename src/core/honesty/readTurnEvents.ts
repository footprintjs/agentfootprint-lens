import { object, own, path, samePath, readSourcePosition, type SourcePosition } from '../cursor/sourcePosition.js';

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

function optionalPath(value: unknown): readonly string[] {
  return value === undefined ? [] : path(value);
}

function within(owner: readonly string[], candidate: readonly string[]): boolean {
  return candidate.length >= owner.length &&
    owner.every((part, index) => candidate[index] === part);
}

function knownUnmountedTerminal(meta: object): boolean {
  return own(meta, 'rootTurn') === true;
}

function isWithheld(value: unknown): boolean {
  return value === '[REDACTED]' || value === 'REDACTED';
}

function readPayload(value: unknown): object | undefined {
  return isWithheld(value) ? undefined : object(value);
}

function nestedInExcluded(parts: readonly string[] | undefined, excluded: ReadonlySet<string>): boolean {
  if (parts === undefined || excluded.size === 0) return false;
  for (let length = 1; length <= parts.length; length++) {
    if (excluded.has(JSON.stringify(parts.slice(0, length)))) return true;
  }
  return false;
}

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
    const startMeta = object(own(start, 'meta'));
    const startPayload = readPayload(own(start, 'payload'));
    const turnIndex = startPayload === undefined ? own(startMeta, 'turnIndex') : own(startPayload, 'turnIndex');
    const runId = own(startMeta, 'runId');
    const composition = optionalPath(own(startMeta, 'compositionPath'));
    const mount = optionalPath(own(startMeta, 'subflowPath'));
    const ownerPosition = readSourcePosition(own(startMeta, 'sourcePosition'));
    const mounted = own(startMeta, 'mountedTurn') === true || mount.length > 0;
    if (typeof turnIndex !== 'number' || !Number.isSafeInteger(turnIndex) || turnIndex < 0 ||
        typeof runId !== 'string' || runId === '' ||
        (mounted && mount.length === 0 && !ownerPosition?.drillPath.length)) {
      return { status: 'unreadable' };
    }

    const events: RecordedTurnEvent[] = [];
    const excludedMounts = new Set<string>();
    const excludedStaticMounts = new Set<string>();
    for (let index = startEventIndex; index <= through; index++) {
      const event = object(own(rawEvents, String(index)));
      const type = own(event, 'type');
      if (typeof type !== 'string') return { status: 'unreadable' };
      const meta = object(own(event, 'meta'));
      if (own(meta, 'runId') !== runId ||
          !samePath(composition, optionalPath(own(meta, 'compositionPath')))) continue;

      const position = readSourcePosition(own(meta, 'sourcePosition'));
      const subflow = optionalPath(own(meta, 'subflowPath'));
      const runtimeScoped = position !== undefined && ownerPosition !== undefined;
      const ownerPath = runtimeScoped ? ownerPosition.drillPath : mount;
      const eventPath = runtimeScoped ? position.drillPath : subflow;
      const isMounted = own(meta, 'mountedTurn') === true;
      if (!within(ownerPath, eventPath) || (mounted && knownUnmountedTerminal(meta))) continue;

      if (type === turnStartType && index !== startEventIndex) {
        if (samePath(ownerPath, eventPath)) {
          // One native run can carry several invocations, but a child start
          // never closes the selected owner's bracket.
          if (mounted || !isMounted) break;
          continue;
        }
        if (position !== undefined) excludedMounts.add(JSON.stringify(position.drillPath));
        if (subflow.length > mount.length) excludedStaticMounts.add(JSON.stringify(subflow));
        continue;
      }
      if ((!mounted && isMounted) ||
          nestedInExcluded(position?.drillPath, excludedMounts) ||
          nestedInExcluded(subflow, excludedStaticMounts)) continue;

      const payload = readPayload(own(event, 'payload'));
      if (type === turnEndType) {
        const endTurn = payload === undefined ? own(meta, 'turnIndex') : own(payload, 'turnIndex');
        if (endTurn !== turnIndex && !(payload === undefined && endTurn === undefined)) continue;
      } else if (payload === undefined && type !== turnStartType) {
        continue;
      }
      const runtimeStageId = own(meta, 'runtimeStageId');
      events.push({
        type,
        payload: payload ?? {},
        address: {
          eventIndex: index,
          ...(typeof runtimeStageId === 'string' && runtimeStageId !== '' && { runtimeStageId }),
          ...(position !== undefined && { sourcePosition: position }),
        },
      });
      if (type === turnEndType) break;
    }
    return { status: 'ready', events };
  } catch {
    return { status: 'unreadable' };
  }
}
