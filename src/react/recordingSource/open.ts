import { createLensRecordingSource, type LensRecordingSourceOptions } from './controller.js';
import type { LensRecordedModelInputReader, LensRecordingSource } from './types.js';
import type { RecordedInvocation } from '../../core/recordingSourceCodec/index.js';

export type LensRecordingReaderResult<T> =
  | { readonly status: 'ready'; readonly coverage: 'whole' | 'prefix'; readonly value: T }
  | { readonly status: 'unavailable' };

/** Binds Lens to an authorized recording. The reader owns range I/O and integrity. */
export interface LensRecordingReader {
  readonly readModelInput?: LensRecordedModelInputReader;
  readRoot(options: { readonly signal?: AbortSignal }): Promise<LensRecordingReaderResult<unknown>>;
  readSubflow(
    request: RecordedInvocation,
    options: { readonly signal: AbortSignal },
  ): Promise<LensRecordingReaderResult<{ readonly result: unknown }>>;
}

export interface OpenLensRecordingSourceOptions extends Omit<LensRecordingSourceOptions, 'root' | 'loadSubflow' | 'readModelInput'> {
  readonly reader: LensRecordingReader;
  readonly signal?: AbortSignal;
}

export type OpenLensRecordingSourceResult =
  | { readonly status: 'ready'; readonly source: LensRecordingSource }
  | { readonly status: 'unavailable'; readonly reason: 'cancelled' | 'incomplete' | 'unavailable' };

/** Open only the root; the existing controller reads exact child units on demand. */
export async function openLensRecordingSource({
  reader,
  signal,
  ...options
}: OpenLensRecordingSourceOptions): Promise<OpenLensRecordingSourceResult> {
  try {
    if (signal?.aborted) return { status: 'unavailable', reason: 'cancelled' };
    const root = await reader.readRoot({ signal });
    if (signal?.aborted) return { status: 'unavailable', reason: 'cancelled' };
    if (root.status !== 'ready') return { status: 'unavailable', reason: 'unavailable' };
    if (root.coverage !== 'whole') return { status: 'unavailable', reason: 'incomplete' };

    const source = createLensRecordingSource({
      ...options,
      root: root.value,
      ...(reader.readModelInput && { readModelInput: reader.readModelInput.bind(reader) }),
      async loadSubflow(request, interest) {
        const child = await reader.readSubflow(request, interest);
        if (interest.signal.aborted || child.status !== 'ready' || child.coverage !== 'whole') {
          throw new Error('The recorded invocation is unavailable.');
        }
        return child.value;
      },
    });
    return { status: 'ready', source };
  } catch {
    return { status: 'unavailable', reason: signal?.aborted ? 'cancelled' : 'unavailable' };
  }
}
