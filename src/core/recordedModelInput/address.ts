import { id, object, own, path, readSourcePosition, samePath } from '../cursor/sourcePosition.js';
import type { RecordedInvocation } from '../recordingSourceCodec/types.js';

/** An address on the original saved child log, before renderer projection. */
export interface RecordedModelCallAddress {
  readonly engineRunId: string;
  readonly logRunId: string;
  readonly invocationPath: readonly string[];
  readonly runtimeStageId: string;
  readonly commitIdx: number;
}

/** Resolve a stage already selected on the admitted child's exact axis. */
export function recordedModelCallAddress(
  request: RecordedInvocation,
  runtimeStageId: string,
  rootSnapshot: unknown,
  events: readonly unknown[],
  childResult: unknown,
): RecordedModelCallAddress | undefined {
  try {
    if (request.invocationPath.length === 0 ||
        request.invocationPath[request.invocationPath.length - 1] !== request.mountRuntimeStageId) return undefined;

    const root = object(rootSnapshot);
    const engineRunId = id(own(root, 'runId'));
    if (request.runId !== undefined && request.runId !== engineRunId) return undefined;

    const rootAddress = object(own(root, 'logAddress'));
    const logRunId = id(own(rootAddress, 'logRunId'));
    const nativePath = [...path(own(rootAddress, 'drillPath')), ...request.invocationPath];
    const tree = object(own(object(childResult), 'treeContext'));
    const childAddress = object(own(tree, 'logAddress'));
    if (own(childAddress, 'logRunId') !== logRunId ||
        !samePath(path(own(childAddress, 'drillPath')), nativePath)) return undefined;

    let foundStart = false;
    for (const event of events) {
      const row = object(event);
      if (own(row, 'type') !== 'agentfootprint.stream.llm_start') continue;
      const meta = object(own(row, 'meta'));
      if (own(meta, 'runtimeStageId') !== runtimeStageId) continue;
      const position = readSourcePosition(own(meta, 'sourcePosition'));
      if (!position || position.engineRunId !== engineRunId ||
          position.logRunId !== logRunId || !samePath(position.drillPath, nativePath)) continue;
      if (foundStart) return undefined;
      foundStart = true;
    }
    if (!foundStart) return undefined;

    const history = own(tree, 'history');
    if (!Array.isArray(history)) return undefined;
    let commitIdx = -1;
    for (let index = 0; index < history.length; index++) {
      if (own(object(history[index]), 'runtimeStageId') !== runtimeStageId) continue;
      if (commitIdx !== -1) return undefined;
      commitIdx = index;
    }
    if (commitIdx === -1) return undefined;

    return Object.freeze({
      engineRunId,
      logRunId,
      invocationPath: Object.freeze([...request.invocationPath]),
      runtimeStageId,
      commitIdx,
    });
  } catch {
    return undefined;
  }
}
