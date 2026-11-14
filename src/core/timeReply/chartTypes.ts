import type { TimeReplyReader } from './types.js';
import type { TimeReplyValues } from './selection.js';
export interface SubmitPorts {
  readonly awaiting: unknown;
  readonly reader: TimeReplyReader;
  readonly values: TimeReplyValues;
  readonly onAnswer: (answer: { readonly requestId: string; readonly values: Readonly<Record<string, string>> }) => void | Promise<void>;
}
export interface SubmitState { ready: boolean; disposition: string }
export interface SubmitCell {
  answer?: { readonly requestId: string; readonly values: Readonly<Record<string, string>> };
  status?: 'submitted' | 'refused' | 'failed';
}
export interface TimeReplySubmission {
  readonly status: 'submitted' | 'refused' | 'failed';
  readonly trace: { readonly state: Record<string, unknown>; readonly executionTree: unknown; readonly commitLog: readonly unknown[] };
}
