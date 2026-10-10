// Copy this into an isolated packed-package consumer and compile with strict
// TypeScript. Imports must resolve to the installed peers, not repo source.
import { buildGroups, type Group } from 'agentfootprint-lens/core';
import { BoundaryRecorder, type BoundaryRangeLabel } from 'agentfootprint/observe';
import { CommitRangeIndex } from 'footprintjs/trace';

const recorder = new BoundaryRecorder();
const originalIndex = new CommitRangeIndex<BoundaryRangeLabel>();

// The AgentFootprint 10 lane supplies Foottrace's class; the 9.x lane and
// direct FootPrint callers retain their existing concrete-class inputs.
export const recorderGroups: readonly Group[] = buildGroups(recorder.boundaryIndex);
export const originalGroups: readonly Group[] = buildGroups(originalIndex);
export const queryGroups: readonly Group[] = buildGroups({
  enclosing: recorder.boundaryIndex.enclosing.bind(recorder.boundaryIndex),
  overlapping: recorder.boundaryIndex.overlapping.bind(recorder.boundaryIndex),
});

// @ts-expect-error both boundary queries are required
buildGroups({ enclosing: recorder.boundaryIndex.enclosing.bind(recorder.boundaryIndex) });
// @ts-expect-error arbitrary objects are not a boundary index
buildGroups({});
