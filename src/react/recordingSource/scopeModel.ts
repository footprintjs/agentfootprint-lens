import type { RecordedInvocation } from '../../core/recordingSourceCodec/index.js';

export const ROOT_SCOPE: readonly string[] = Object.freeze([]);
export function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
export function scopeFor(invocations: readonly RecordedInvocation[], drillPath: readonly string[]): readonly string[] {
  let selected = ROOT_SCOPE;
  for (const value of invocations) if (value.invocationPath.length > selected.length
    && value.invocationPath.every((id, index) => id === drillPath[index])) selected = value.invocationPath;
  return selected;
}
export function childrenAt(invocations: readonly RecordedInvocation[], path: readonly string[]): readonly RecordedInvocation[] {
  return invocations.filter(value => value.invocationPath.length === path.length + 1
    && path.every((id, index) => value.invocationPath[index] === id));
}
