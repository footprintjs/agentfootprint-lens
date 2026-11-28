/** Opt-in native lazy replay; requires footprint-explainable-ui 1.0.1 or newer. */
export { createLensRecordingSource } from '../react/recordingSource/controller.js';
export type { LensRecordingSourceOptions } from '../react/recordingSource/controller.js';
export { openLensRecordingSource } from '../react/recordingSource/open.js';
export type {
  LensRecordingReader,
  LensRecordingReaderResult,
  OpenLensRecordingSourceOptions,
  OpenLensRecordingSourceResult,
} from '../react/recordingSource/open.js';
export { useRecordingSource } from '../react/recordingSource/useRecordingSource.js';
export type { LensRecordingSource, LensRecordingSourceSnapshot, LensRecordingLoad, LensRecordedModelInputReader } from '../react/recordingSource/types.js';
