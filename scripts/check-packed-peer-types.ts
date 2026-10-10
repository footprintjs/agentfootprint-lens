// Copy this into an isolated packed-package consumer and compile with strict
// TypeScript. Imports must resolve to the installed peers, not repo source.
import { buildGroups, type Group } from 'agentfootprint-lens/core';
import { BoundaryRecorder, type BoundaryRangeLabel } from 'agentfootprint/observe';
import { CommitRangeIndex, sliceForKey, keysReadFromExecutionTree } from 'foottrace';
import type { RuntimeSnapshot } from 'footprintjs';

const recorder = new BoundaryRecorder();
const canonicalIndex = new CommitRangeIndex<BoundaryRangeLabel>();

// Both AgentFootprint's 9.x engine-owned and 10.x Foottrace-owned indexes fit
// the structural query port. Foottrace also reads the engine snapshot cast-free.
export const recorderGroups: readonly Group[] = buildGroups(recorder.boundaryIndex);
export const canonicalGroups: readonly Group[] = buildGroups(canonicalIndex);
export const readSnapshot = (snapshot: RuntimeSnapshot, key: string) =>
  sliceForKey(snapshot.commitLog, key, keysReadFromExecutionTree(snapshot.executionTree));
export const queryGroups: readonly Group[] = buildGroups({
  enclosing: recorder.boundaryIndex.enclosing.bind(recorder.boundaryIndex),
  overlapping: recorder.boundaryIndex.overlapping.bind(recorder.boundaryIndex),
});

// @ts-expect-error both boundary queries are required
buildGroups({ enclosing: recorder.boundaryIndex.enclosing.bind(recorder.boundaryIndex) });
// @ts-expect-error arbitrary objects are not a boundary index
buildGroups({});
