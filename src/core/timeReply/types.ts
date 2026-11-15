/** Structural native reader port: assignable from agentfootprint/time's public reader. */
export interface TimeReplyRequestView {
  readonly fields: readonly { readonly id: string; readonly type: string; readonly required?: boolean;
    readonly format?: string; readonly enum?: readonly unknown[]; readonly labels?: readonly string[] }[];
  readonly context?: unknown;
}
export interface TimeReplyPairView { readonly range: string; readonly correction: string }
export type TimeReplyReader = (request: TimeReplyRequestView) => readonly TimeReplyPairView[];
export interface TimeReplyField {
  readonly id: string;
  readonly description?: string;
  readonly choices: readonly { readonly value: string; readonly label?: string }[];
}
export interface TimeReplyForm {
  /** The exact native request generation, retained for lifecycle identity, never chart scope. */
  readonly request: TimeReplyRequestView;
  readonly requestId: string;
  readonly pairs: readonly { readonly range: TimeReplyField; readonly correction: TimeReplyField }[];
  /** True only when these controls cover the complete declared form. */
  readonly complete: boolean;
}
export type TimeReplyInput =
  | { readonly status: 'unchecked'; readonly reason: 'reader-missing' | 'request-unavailable' }
  | { readonly status: 'none' }
  | { readonly status: 'unavailable'; readonly reason: 'binding-unavailable' | 'presentation-limit' }
  | { readonly status: 'ready'; readonly form: TimeReplyForm };
