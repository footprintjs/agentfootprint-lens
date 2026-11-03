/** The imported type shapes Lens uses, compiled against the installed candidate. */
import type {
  FoldBasis, FoldedState, FoldSource, Mark, MissingSliceReason, Move,
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
