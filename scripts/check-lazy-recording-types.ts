import { Lens, type LensProps, type LensDetailSlotProps } from 'agentfootprint-lens';
import { projectRecordingSource, readRecordingSourceRoot, readRecordingSubflow, type RecordedInvocation, type RecordingSourceRoot } from 'agentfootprint-lens/recording';
import { createLensRecordingSource, useRecordingSource, type LensRecordingSource, type LensRecordingSourceOptions } from 'agentfootprint-lens/recording/react';
const projected = projectRecordingSource({});
export const doors = [Lens, projectRecordingSource, readRecordingSourceRoot, readRecordingSubflow, createLensRecordingSource, useRecordingSource];
export function consumer(root: RecordingSourceRoot, request: RecordedInvocation) {
  const options: LensRecordingSourceOptions = { root, loadSubflow: async (_exact, { signal }) => { signal.throwIfAborted(); return { result: {} }; } };
  const source: LensRecordingSource = createLensRecordingSource(options);
  const props: LensProps = { recorder: source.observed.recorder, runner: source.observed.runner, recordingSource: source };
  void source.load(request, { signal: new AbortController().signal });
  void source.resolveAddress({ runtimeStageId: 'exact#1', commitIdx: 0, drillPath: request.invocationPath });
  source.dispose();
  return props;
}
export function detail(props: LensDetailSlotProps) { return props.onNavigateRecordingAddress?.({ runtimeStageId: 'exact#1', commitIdx: 0, drillPath: props.invocationPath }); }
// @ts-expect-error descriptor shape cannot omit its exact native mount identity
const invalid: RecordedInvocation = { invocationPath: ['scope#1'], subflowId: 'scope' };
void invalid; void projected;
