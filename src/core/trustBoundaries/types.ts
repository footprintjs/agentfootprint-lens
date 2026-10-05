/** Reader-owned v1 wire types; no dependency on an unpublished producer release. */
export type TrustSourcePosition = import('../cursor/sourcePrefix.js').SourcePosition;

interface Origin {
  readonly seq: number;
  readonly runId: string;
  readonly runtimeStageId: string;
  readonly wallClockMs: number;
  readonly sourcePosition?: TrustSourcePosition;
  readonly toolCallId?: string;
  readonly iteration?: number;
}

export type TrustBoundaryFact = Origin &
  (
    | {
        readonly eventType: 'agentfootprint.middleware.decision';
        readonly middleware: string;
        readonly moment: 'input' | 'window' | 'before-tool' | 'after-tool' | 'output';
        readonly outcome: 'allow' | 'deny' | 'ask';
        readonly changed: boolean;
        readonly iteration: number;
      }
    | {
        readonly eventType: 'agentfootprint.permission.check';
        readonly capability:
          | 'tool_call'
          | 'skill_read'
          | 'memory_read'
          | 'memory_write'
          | 'external_net'
          | 'user_data';
        readonly result: 'allow' | 'deny' | 'halt' | 'gate_open';
        readonly target?: string;
        readonly policyRuleId?: string;
      }
    | {
        readonly eventType: 'agentfootprint.permission.halt';
        readonly target: string;
        readonly checkerId?: string;
        readonly iteration: number;
      }
    | {
        readonly eventType: 'agentfootprint.credential.requested';
        readonly service: string;
        readonly mode?: 'machine' | 'user';
      }
    | {
        readonly eventType: 'agentfootprint.credential.acquired';
        readonly service: string;
        readonly kind: string;
      }
    | {
        readonly eventType: 'agentfootprint.credential.authorization_required';
        readonly service: string;
      }
    | {
        readonly eventType: 'agentfootprint.credential.failed';
        readonly service: string;
        readonly errorClass?: string;
      }
  );

export interface TrustBoundaryCounters {
  readonly observed: number;
  readonly retained: number;
  readonly evicted: number;
  readonly invalid: number;
  readonly oversized: number;
  readonly pending: number;
}

export interface TrustBoundaryCapture {
  readonly id: string;
  readonly captureId: string;
  readonly facts: readonly TrustBoundaryFact[];
  readonly counters: TrustBoundaryCounters;
  readonly firstObservedSeq: number | null;
  readonly lastObservedSeq: number | null;
  readonly firstRetainedSeq: number | null;
  readonly lastRetainedSeq: number | null;
}

export type TrustBoundariesRead =
  | { readonly status: 'available'; readonly captures: readonly TrustBoundaryCapture[] }
  | { readonly status: 'missing' | 'unsupported' | 'invalid'; readonly message: string };
