import { useCallback, useMemo } from 'react';
import {
  readPayloadMarks, stepPayloadReader, type InvocationPayloadLoad, type StepPayloadReader,
} from '../../core/subflowPayloads/index.js';
import type { LensRecordingSource } from './types.js';
import { useRecordingSource } from './useRecordingSource.js';

export interface StepPayloads {
  readonly reader: StepPayloadReader;
  /**
   * Hold these invocations' payloads (mount runtime ids) while a view shows
   * them: they are read through the source's `loadPayloads`, never through
   * the renderer's set of loaded children. Returns the release, which cancels
   * a read nobody else holds. Ids outside the manifest are skipped.
   */
  readonly request: (invocations: readonly string[]) => () => void;
}

const NO_LOADS = new Map<string, InvocationPayloadLoad>();
const NOTHING = () => {};

/**
 * Where a step's boundary payloads are, for the views that show them. Marks
 * come from the recording's base row (`snapshot.recorders`); reads and the
 * payloads replies carried come from the lazy source, when there is one and it
 * can read payloads. Otherwise a marked payload reads as not loaded
 * (`no-source`).
 */
export function useStepPayloads(source: LensRecordingSource | undefined, runSnapshot: unknown): StepPayloads {
  const snapshot = useRecordingSource(source);
  const recorders = ((snapshot?.recording.snapshot ?? runSnapshot) as { readonly recorders?: unknown } | null | undefined)?.recorders;
  const marks = useMemo(() => readPayloadMarks({ recorders }), [recorders]);
  const ready = snapshot?.subflowPayloads, reads = snapshot?.payloadReads;
  const loads = useMemo(() => {
    if (ready === undefined && reads === undefined) return NO_LOADS;
    const out = new Map<string, InvocationPayloadLoad>();
    for (const [id, status] of reads ?? []) out.set(id, { status });
    for (const [id, payloads] of ready ?? []) out.set(id, { status: 'ready', payloads });
    return out;
  }, [ready, reads]);
  const invocations = snapshot?.invocations;
  const canRead = typeof source?.loadPayloads === 'function';
  const loadable = useMemo(() => new Set(canRead ? (invocations ?? []).map(value => value.mountRuntimeStageId) : []), [invocations, canRead]);
  const reader = useMemo(() => stepPayloadReader({ marks, loads, loadable }), [marks, loads, loadable]);
  const request = useCallback((ids: readonly string[]) => {
    if (source?.loadPayloads === undefined || invocations === undefined || ids.length === 0) return NOTHING;
    const held = new AbortController();
    for (const id of ids) {
      const exact = invocations.find(value => value.mountRuntimeStageId === id);
      // The source never rejects a failed read (its outcome is in the
      // snapshot); it rejects only an id outside its manifest, skipped here.
      if (exact !== undefined) void source.loadPayloads(exact, { signal: held.signal });
    }
    return () => held.abort();
  }, [source, invocations]);
  return useMemo(() => ({ reader, request }), [reader, request]);
}
