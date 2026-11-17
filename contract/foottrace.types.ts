import { buildRuntimeStageId, isExecutionKey } from 'foottrace';

/** The imported type shapes Lens uses, compiled against the installed candidate. */
import type {
  FoldBasis, FoldedState, FoldSource, LogAddress, Mark, MissingSliceReason, Move,
  MoveRefusal, RangeToken, Stop, StopKind, TimeTravel, TimeTravelStrategy,
} from 'foottrace';

export function lensTypeContract(source: FoldSource, folded: FoldedState,
  cursor: TimeTravel, strategy: TimeTravelStrategy, token: RangeToken): void {
  const basis: FoldBasis = folded.basis;
  const state: Readonly<Record<string, unknown>> = folded.state;
  const skipped: readonly number[] | undefined = folded.skipped?.map((gap) => gap.index);
  const stop: Stop | undefined = cursor.at();
  const kind: StopKind | undefined = stop?.kind;
  const move: Move = cursor.next();
  const refusal: MoveRefusal | undefined = move.moved ? undefined : move.reason;
  const mark: Mark | undefined = cursor.mark('lens');
  const marks: readonly Mark[] = cursor.marks();
  const missing: MissingSliceReason = 'never-written';
  const custom: TimeTravelStrategy = { stopsFor: (log, tree) => strategy.stopsFor(log, tree) };
  void [source.commitLog, basis, state, skipped, kind, refusal, mark, marks, missing, custom, token];
}

/** The codec composes an exact native identity and separately detects execution keys. */
export function lensIdentityContract(...input: Parameters<typeof buildRuntimeStageId>): string {
  const runtimeId: ReturnType<typeof buildRuntimeStageId> = buildRuntimeStageId(...input);
  const value: string = runtimeId;
  const detected: boolean = isExecutionKey(value);
  // @ts-expect-error execution indices are numeric, never a serialized string
  buildRuntimeStageId('stage', '7');
  // @ts-expect-error detection consumes a string, never an unadmitted object
  isExecutionKey({ runtimeStageId: value });
  void detected;
  return value;
}

/** The native source address keeps its immutable log owner and exact mount chain. */
export function lensLogAddressContract(address: LogAddress): readonly string[] {
  const owner: string = address.logRunId;
  const path: readonly string[] = address.drillPath;
  const root: LogAddress = {logRunId: owner, drillPath: []};
  const child: LogAddress = {logRunId: owner, drillPath: ['outer#1', 'outer/child#3']};
  // @ts-expect-error an address always declares the exact root-or-child path
  const missingPath: LogAddress = {logRunId: owner};
  // @ts-expect-error native recorded paths cannot be mutated by a reader
  address.drillPath.push('forged#9');
  void [root, child, missingPath];
  return [owner, ...path];
}
