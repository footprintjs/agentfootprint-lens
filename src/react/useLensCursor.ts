/**
 * useLensCursor — the ONE cursor, controlled or uncontrolled.
 *
 * `<Lens>` has always held its scrub position in local state. This hook is that
 * same state with one addition: when the host passes a value, the host owns it.
 * The standard controlled/uncontrolled pair, modelled on
 * `<TraceExplorerShell selectedRuntimeStageId / onSelectionChange>` in
 * `footprint-explainable-ui` so the family reads as one API.
 *
 * The law it exists to keep: **one cursor, never two owners.** Every mover
 * inside the lens — the step strip, the ◀ ▶ ⟳Live buttons, the arrow keys, a
 * chart node click, a "what happened" moment, a provenance jump, and the
 * auto-advance that follows a live run — goes through `moveTo`. A mover that
 * sets position without notifying would be a second cursor wearing the first
 * one's clothes.
 *
 * Omit `controlledStep` and nothing changes: the hook keeps today's internal
 * state and today's auto-advance, byte for byte.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { LensCursorPort } from '../core/timeTravel/lensCursorPort.js';

/**
 * Where the cursor landed, in all three units the lens knows — handed to
 * `onStepChange` alongside the step so a host never has to reverse-engineer
 * the lens's axis.
 */
export interface LensCursorAt {
  /** The new cursor position, on the lens's step axis. Same number the
   *  `step` prop takes. */
  readonly step: number;
  /** How many positions the axis has right now. Valid steps are
   *  `0 … totalSteps - 1`. GROWS during a live run. */
  readonly totalSteps: number;
  /** The cursor's address in footprintjs's address space
   *  (`[subflowPath/]stageId#executionIndex`) — the same string
   *  `<TraceExplorerShell>` and `<RunSlider>` call `selectedRuntimeStageId` /
   *  `cursorRuntimeStageId`. `''` when the axis is empty. */
  readonly runtimeStageId: string;
  /** The commit-log index this position anchors to. `-1` when unknown. */
  readonly commitIdx: number;
  /** The position's human label, as the step strip and the timeline spell it
   *  ("Iteration 2", "Context 3", "Run · start"). */
  readonly label: string;
  /** What kind of stop this is. Absent when the axis is empty. */
  readonly kind?: string;
  /**
   * `true` when this call is Lens CORRECTING a step that is not a position on
   * the axis it is now read against, not a move someone made. That is an
   * out-of-range `step` you passed, one an internal jump produced, OR — when
   * you passed no `step` at all — the lens's own remembered step after the
   * axis shrank under it. Uncontrolled snaps are reported too, so this flag
   * means the same thing in both modes. Store the corrected value and the two
   * cursors agree again.
   */
  readonly clamped: boolean;
}

/** The cursor's address at one step — resolved by the caller, which owns the
 *  position list. */
export interface LensCursorPlace {
  readonly runtimeStageId: string;
  readonly commitIdx: number;
  readonly label: string;
  readonly kind?: string;
}

export interface UseLensCursorArgs {
  /** The host's value. `undefined` → uncontrolled (Lens owns the cursor). */
  readonly controlledStep: number | undefined;
  /** Fires on every cursor move, controlled or not. */
  readonly onStepChange?: ((step: number, at: LensCursorAt) => void) | undefined;
  /** Highest valid step (`totalSteps - 1`). */
  readonly maxStep: number;
  /** Resolve a step to its address. Called only when a move is reported. */
  readonly describe: (step: number) => LensCursorPlace;
  /**
   * The MOVEMENT port — footprintjs 9.17's reader cursor over the Lens's own
   * stops (`openLensCursor(positions)`). When present, every move this funnel
   * makes is decided by the library: where a step lands, what happens at the
   * ends of the axis, and what an out-of-range ask does. Omit it and the
   * funnel keeps its own arithmetic, unchanged — which is what the hook's own
   * tests drive, so the two readings can be compared.
   *
   * It is NOT a second cursor: the port is re-seated on the step this hook
   * owns before every question and remembers nothing between them.
   */
  readonly port?: LensCursorPort | undefined;
}

export interface UseLensCursorResult {
  /** The cursor to render. */
  readonly step: number;
  /** Pinned to the live edge (drives the ⟳Live affordance). */
  readonly isLive: boolean;
  /** The ONE way anything inside the lens moves the cursor. */
  readonly moveTo: (n: number) => void;
}

/**
 * Snap a host-supplied step onto the axis. Non-finite and fractional values
 * are not positions, so they clamp too — and the clamp is always reported.
 */
export function clampStep(n: number, maxStep: number): number {
  if (!Number.isFinite(n)) return 0;
  const whole = Math.trunc(n);
  if (whole < 0) return 0;
  if (whole > maxStep) return Math.max(0, maxStep);
  return whole;
}

export function useLensCursor({
  controlledStep,
  onStepChange,
  maxStep,
  describe,
  port,
}: UseLensCursorArgs): UseLensCursorResult {
  const isControlled = controlledStep !== undefined;

  // Position state — used only when the host doesn't own the cursor.
  const [internalStep, setInternalStep] = useState(0);
  // "Stay pinned to live" — a MODE, not a position. It never decides where the
  // cursor is; it only asks `moveTo` to follow the growing edge, so it cannot
  // become a second owner. Kept in both modes: in controlled mode it re-derives
  // whenever the host sets a value, and holds still while the axis grows (which
  // is what lets a following host keep following).
  const [autoAdvance, setAutoAdvance] = useState(
    () => controlledStep === undefined || clampStep(controlledStep, maxStep) >= maxStep,
  );

  // THE CURSOR IS ALWAYS A POSITION. A host-supplied value has always been
  // snapped onto the axis; the INTERNAL one is snapped the same way now,
  // because the axis SHRINKS as well as grows — switch `granularity` from
  // 'step' to 'group' on a long run, or drill into a small group, and a
  // remembered step can be past the end of the axis it is now read against.
  // Left unsnapped it reached `<TimeTravel focusSeq>`, the strip highlight and
  // the movement port as a step that does not exist. Snapping here is the ONE
  // place that can fix it for every reader at once: `step` is what the whole
  // component tree sees, and `stepRef` is what the funnel hands the port.
  const step = clampStep(isControlled ? controlledStep : internalStep, maxStep);
  const isLive = autoAdvance && step >= maxStep;

  // Refs so `notify` / `moveTo` stay identity-stable: an unstable notifier in a
  // dependency array re-runs the auto-advance effect and double-fires.
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const onChangeRef = useRef(onStepChange);
  onChangeRef.current = onStepChange;
  const maxRef = useRef(maxStep);
  maxRef.current = maxStep;
  const stepRef = useRef(step);
  stepRef.current = step;
  const portRef = useRef(port);
  portRef.current = port;

  const notify = useCallback((n: number, clamped: boolean): void => {
    const cb = onChangeRef.current;
    if (!cb) return;
    const place = describeRef.current(n);
    cb(n, {
      step: n,
      totalSteps: maxRef.current + 1,
      runtimeStageId: place.runtimeStageId,
      commitIdx: place.commitIdx,
      label: place.label,
      ...(place.kind !== undefined ? { kind: place.kind } : {}),
      clamped,
    });
  }, []);

  const moveTo = useCallback((n: number): void => {
    const from = stepRef.current;
    // WHERE IT LANDS is the port's answer when there is one: `jumpTo` over the
    // Lens's own stops, with the library's clamp law (an ask outside the axis
    // names the end it hit; the same step you are on is not a move). Without a
    // port the funnel keeps its own arithmetic, byte for byte.
    const to = portRef.current !== undefined
      ? portRef.current.toStep(from, n)
      : { step: n, moved: n !== from, clamped: false };
    // Uncontrolled: today's law, unchanged — the position moves here.
    if (controlledStep === undefined) setInternalStep(to.step);
    // Auto-advance re-engages when the move lands on the live edge, and
    // disengages when it doesn't. Same rule in both modes — and it is why a
    // refused move still comes through here with the step it stayed on: a
    // silent no-op at the end of the axis would switch "follow live" off.
    setAutoAdvance(to.step >= maxRef.current);
    // Not a move → not a change. This is what keeps a host echo from
    // ping-ponging: the echoed value equals the current one and stops here. A
    // CLAMP is the exception — the cursor may not have moved, but the value
    // the host holds is not a position, and it has to be told.
    if (to.step === from && !to.clamped) return;
    notify(to.step, to.clamped);
  }, [controlledStep, notify]);

  // Controlled mode: re-derive the follow-live mode whenever the HOST sets a
  // value (an echo of our own move re-derives to the same answer). Deliberately
  // NOT keyed on `maxStep` — a host sitting on the live edge must keep
  // following as the axis grows under it.
  useEffect(() => {
    if (controlledStep === undefined) return;
    setAutoAdvance(clampStep(controlledStep, maxRef.current) >= maxRef.current);
  }, [controlledStep]);

  // Follow the live edge. The shipped lens did this with a bare
  // `setFocusStep(maxStep)` — a mover that told nobody. It goes through the
  // same funnel now, so a host that follows the cursor sees the run advance.
  useEffect(() => {
    if (!autoAdvance) return;
    if (step === maxStep) return;
    if (controlledStep === undefined) setInternalStep(maxStep);
    notify(maxStep, false);
    // `step` is deliberately absent: this effect reacts to the axis growing,
    // and reads the current step through the guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxStep, autoAdvance, controlledStep, notify]);

  // Out-of-range correction — clamp AND say so, never a silent clamp, and in
  // BOTH modes. The value being corrected is whoever owns the cursor's: the
  // host's `step` when controlled, this hook's own remembered step when not.
  //
  // The uncontrolled snap used to be the silent one, and that made the law
  // above true of one mode only. The axis SHRINKS — switch `granularity` from
  // 'step' to 'group', or drill into a smaller group — a remembered step is
  // then past the end, `step` renders somewhere else, and an observing host
  // was never told. It is reported now, with the same `clamped: true` a
  // controlled host already gets.
  //
  // The CONSOLE warning stays controlled-only: it teaches a host about a value
  // the host passed, and an uncontrolled host passed none — a warning there
  // would be scolding the lens's own state.
  //
  // What is deliberately NOT done: `internalStep` is left as it is rather than
  // rewritten to `snapped`. Snapping is a READ (`step` above), so a stale
  // internal value comes back when the axis regrows — today's behaviour,
  // untouched. This effect reports the correction; it does not change it.
  const warnedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const owned = controlledStep !== undefined ? controlledStep : internalStep;
    const snapped = clampStep(owned, maxStep);
    if (snapped === owned) return;
    if (controlledStep !== undefined) {
      const key = `${controlledStep}/${maxStep}`;
      if (warnedRef.current !== key) {
        warnedRef.current = key;
        // eslint-disable-next-line no-console
        console.warn(
          `[agentfootprint-lens] <Lens step={${controlledStep}}> is not a position in this run: ` +
            `the cursor axis holds ${maxStep + 1} step${maxStep === 0 ? '' : 's'} (0…${maxStep}). ` +
            `Lens moved to step ${snapped} and called onStepChange(${snapped}, { clamped: true }) ` +
            `so your state can follow. The axis GROWS as the run does, so store the value the ` +
            `callback hands you rather than a remembered number.`,
        );
      }
    }
    notify(snapped, true);
  }, [controlledStep, internalStep, maxStep, notify]);

  return { step, isLive, moveTo };
}
