import { useCallback, useMemo } from 'react';
import {
  readPayloadMarks, stepPayloadReader, type InvocationPayloadLoad, type StepPayloadReader,
} from '../../core/subflowPayloads/index.js';
import type { LensRecordingSource } from './types.js';
import { useRecordingSource } from './useRecordingSource.js';

export interface StepPayloads {
  readonly reader: StepPayloadReader;
  /** Ask the source for these invocations (mount runtime ids). Ids outside its manifest, or already asked for, are skipped. */
  readonly request: (invocations: readonly string[]) => void;
}

const NO_LOADS = new Map<string, InvocationPayloadLoad>();

/**
 * Where a step's boundary payloads are, for the views that show them. Marks
 * come from the recording's base row (`snapshot.recorders`); loads and the
 * payloads their replies carried come from the lazy source, when there is
 * one. Without a source a marked payload reads as not loaded (`no-source`).
 */
export function useStepPayloads(source: LensRecordingSource | undefined, runSnapshot: unknown): StepPayloads {
  const snapshot = useRecordingSource(source);
  const recorders = ((snapshot?.recording.snapshot ?? runSnapshot) as { readonly recorders?: unknown } | null | undefined)?.recorders;
  const marks = useMemo(() => readPayloadMarks({ recorders }), [recorders]);
  const loads = useMemo(() => {
    if (snapshot === undefined) return NO_LOADS;
    const out = new Map<string, InvocationPayloadLoad>();
    for (const load of snapshot.loads) {
      const id = load.request.mountRuntimeStageId;
      out.set(id, { status: load.status, ...(load.status === 'ready' && { payloads: snapshot.subflowPayloads.get(id) ?? null }) });
    }
    return out;
  }, [snapshot]);
  const invocations = snapshot?.invocations;
  const loadable = useMemo(() => new Set((invocations ?? []).map(value => value.mountRuntimeStageId)), [invocations]);
  const reader = useMemo(() => stepPayloadReader({ marks, loads, loadable }), [marks, loads, loadable]);
  const request = useCallback((ids: readonly string[]) => {
    if (source === undefined || invocations === undefined) return;
    for (const id of ids) {
      if (loads.has(id)) continue;
      const exact = invocations.find(value => value.mountRuntimeStageId === id);
      // A failed load is shown as "could not be loaded"; it is not retried here.
      if (exact !== undefined) void source.load(exact).catch(() => {});
    }
  }, [source, invocations, loads]);
  return useMemo(() => ({ reader, request }), [reader, request]);
}
