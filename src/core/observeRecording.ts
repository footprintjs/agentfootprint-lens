/**
 * observeRecording — point Lens at a recording instead of at a running agent.
 *
 * `recorder.observe(runner)` is the live rail: a LensRecorder listens to an
 * agent while it runs. A RECORDING is that same run, frozen — the typed events
 * it fired and the footprintjs snapshot it left behind. This is the same
 * sentence with the recording in the runner's place:
 *
 *   ```ts
 *   const { recorder, runner } = observeRecording(JSON.parse(json));
 *   return <Lens recorder={recorder} runner={runner} />;
 *   ```
 *
 * Nothing re-runs, no model is called, no network is touched. The LensRecorder
 * that comes back is the library's own, unmodified — every byte it reports came
 * out of the recording.
 *
 * ONE CALL = ONE REPLAY. Every call builds a fresh LensRecorder and walks the
 * whole event log, so call it ONCE per recording (`useMemo`) rather than in a
 * render body — see the `@example` below.
 *
 * WHAT A RECORDING IS
 * ───────────────────
 *   `events`    the typed agentfootprint events, in the order they fired
 *               (`runner.on('*')` collected at record time).
 *   `snapshot`  the footprintjs run snapshot (`executor.getSnapshot()`), which
 *               carries the commit log and any recorder snapshots the run
 *               attached.
 *   `structure` the agent's build-time chart
 *               (`runner.getSpec().buildTimeStructure`) — optional, and the one
 *               thing a run does NOT leave behind on its own. With it, `<Lens>`
 *               draws the composition the turn actually ran; without it, the
 *               returned `runner` is `undefined`, `chart` is `'absent'`, and
 *               Lens says so on the canvas instead of drawing an empty box.
 *               Apps that froze the same field under the name `blueprint` are
 *               read too — that is the key most recordings in this ecosystem
 *               were written with, and a silently undrawn chart is exactly the
 *               failure this entry point exists to remove.
 *
 * WHAT IT CANNOT GIVE BACK
 * ────────────────────────
 * A recording has no traversal, so footprintjs's FlowRecorder channel
 * (`runner.attach`) has nothing to fire: the structure recorder stays as empty
 * as it was before the call (the chart is drawn from `structure` instead). What
 * WOULD have come off that channel is recovered from the recording's own data —
 * the step strip's commit ranges (`rebuildBoundaryIndex`) and the step graph
 * (`replayStepGraph`) from the BOUNDARY RECORDING, and the runtime overlay
 * (which lights the chart's executed path and the cursor's current node) from
 * the snapshot's COMMIT LOG (`overlayFromSnapshot` → `recorder.runtime.seed`).
 * All read, never derived.
 */

import type { Runner } from 'agentfootprint';
import type { AgentfootprintEvent, Unsubscribe } from 'agentfootprint/events';
import {
  buildStepGraphFromEvents,
  type BoundaryRangeLabel,
  type DomainEvent,
  type StepGraph,
} from 'agentfootprint/observe';
import { isDevMode } from 'footprintjs';
import type { RangeToken } from 'footprintjs/trace';
import { overlayFromSnapshot } from 'footprint-explainable-ui/flowchart';
import { LensRecorder, type LensRecorderOptions } from './LensRecorder.js';

/** The footprintjs run snapshot as it survives serialization. */
export interface RecordedSnapshot {
  /** One bundle per executed stage, in commit order. */
  readonly commitLog?: readonly unknown[];
  /** Snapshots of the recorders that were attached while the run happened. */
  readonly recorders?: readonly {
    readonly name?: string;
    readonly data?: unknown;
  }[];
  readonly [key: string]: unknown;
}

/** One frozen agentfootprint run — the whole input to `observeRecording`. */
export interface Recording {
  /** The run's footprintjs snapshot (`executor.getSnapshot()`), as recorded. */
  readonly snapshot?: RecordedSnapshot | null;
  /** The typed events the run fired, in the order they fired. */
  readonly events?: readonly AgentfootprintEvent[] | null;
  /** The agent's build-time chart (`runner.getSpec().buildTimeStructure`). */
  readonly structure?: unknown;
  /**
   * The same chart under the name most recordings in this ecosystem were
   * frozen with (`{ snapshot, events, blueprint }`). Read when `structure` is
   * absent, so a stored recording drops straight in without a rename.
   */
  readonly blueprint?: unknown;
}

/** What Lens needs, plus an honest account of what the recording carried. */
export interface ObservedRecording {
  /** Hand to `<Lens recorder={...} />`. */
  readonly recorder: LensRecorder;
  /**
   * Hand to `<Lens runner={...} />` so the chart is the composition that ran.
   * `undefined` when the recording carried no `structure` (or `blueprint`) —
   * passing it anyway would draw an empty chart.
   */
  readonly runner: Runner | undefined;
  /**
   * Will the chart draw? `'absent'` means the recording carried no build-time
   * structure — the one piece a run does not leave behind on its own. Lens
   * says so on the canvas; this is the same fact for code that wants to check
   * before rendering.
   */
  readonly chart: 'drawn' | 'absent';
  /**
   * Events OFFERED to the recorder: the length of the recording's log. Every
   * one was walked; an event no subscription heard, and a `null` hole no
   * handler could read, are both counted here. `eventsSkipped` is the subset
   * that threw.
   */
  readonly eventsReplayed: number;
  /**
   * Events at least one handler threw on. They are counted, never fatal —
   * see the isolation note in `observeRecording`. `0` on a healthy recording;
   * anything else is worth surfacing to whoever is looking at the trace (Lens
   * does, as a note above the chart).
   */
  readonly eventsSkipped: number;
  /** Boundary events the recording carried (`0` = it recorded none). */
  readonly boundaryEvents: number;
  /**
   * Commit ranges rebuilt from those events — what the step strip is indexed
   * by. `0` means the strip has nothing to show and stays quiet; say so in the
   * UI rather than inventing stops.
   */
  readonly boundaryRanges: number;
  /**
   * One line per thing in the recording that could not be READ, as opposed to
   * was not there. A recording whose `events` survived storage as a JSON
   * string is not a run with no events, and a `BoundaryEvents` entry whose
   * data is an object is not a run with no boundaries — saying "none" about
   * either would be a false statement about the run. Empty on a healthy
   * recording. Lens renders these itself (they are also put on the recorder),
   * so a consumer never has to remember to.
   */
  readonly notes: readonly string[];
}

/** The boundary recorder's snapshot entry, by the name it writes. */
const BOUNDARY_ENTRY_NAME = 'BoundaryEvents';

/** Boundary event types that OPEN a commit range, and those that close one. */
const OPENS_A_RANGE = new Set(['run.entry', 'subflow.entry', 'composition.start']);
const CLOSES_A_RANGE = new Set(['run.exit', 'subflow.exit', 'composition.end']);

/** Composition kinds accepted by the live boundary-label projection. */
function isCompositionKind(
  value: unknown,
): value is NonNullable<BoundaryRangeLabel['compositionKind']> {
  return (
    value === 'Parallel' ||
    value === 'Sequence' ||
    value === 'Loop' ||
    value === 'Conditional'
  );
}

/**
 * Boundary events that can ONLY come from footprintjs's live traversal channel
 * (`runner.attach`). A replay has no traversal, so these exist only in the
 * recording — see `replayStepGraph`.
 */
const FROM_THE_TRAVERSAL = new Set([
  'run.entry',
  'run.exit',
  'subflow.entry',
  'subflow.exit',
  'fork.branch',
  'decision.branch',
  'loop.iteration',
]);

/** A boundary event as it survives serialization — read defensively. */
interface RecordedBoundaryEvent {
  readonly type?: unknown;
  readonly runtimeStageId?: unknown;
  readonly compositionId?: unknown;
  readonly commitIdxBefore?: unknown;
  readonly payload?: unknown;
  readonly [key: string]: unknown;
}

/** What a listener was subscribed with, in the dispatcher's own three buckets. */
type SubscriptionKind = 'typed' | 'domain' | 'all';

interface ReplayListener {
  readonly type: string;
  readonly kind: SubscriptionKind;
  readonly handler: (event: AgentfootprintEvent) => void;
  readonly once: boolean;
}

/**
 * `'agentfootprint.context.injected'` → `'agentfootprint.context'`. The
 * dispatcher's own domain key (`EventDispatcher.domainKey`) — a domain
 * wildcard bucket is keyed by it EXACTLY, so `'agentfootprint.*'` does not
 * hear a three-segment type and `'agentfootprint.context.*'` does not hear
 * `agentfootprint.contextual.x`.
 */
function domainKey(type: string): string {
  const lastDot = type.lastIndexOf('.');
  return lastDot === -1 ? type : type.slice(0, lastDot);
}

/**
 * Does a subscription for `subscribed` hear an event of type `type`?
 * Mirrors the dispatcher exactly: `'*'` hears everything, an exact type hears
 * itself, and a domain wildcard hears the types whose domain key it IS.
 *
 * @internal Exported so the replay's delivery rules are pinned directly —
 *   they are the whole difference between a faithful replay and a broadcast.
 */
export function hears(subscribed: string, type: string): boolean {
  if (subscribed === '*') return true;
  if (subscribed === type) return true;
  if (subscribed.endsWith('.*')) return subscribed.slice(0, -2) === domainKey(type);
  return false;
}

/** Which of the dispatcher's three buckets a subscription string lands in. */
function subscriptionKind(subscribed: string): SubscriptionKind {
  if (subscribed === '*') return 'all';
  return subscribed.endsWith('.*') ? 'domain' : 'typed';
}

/**
 * The dispatcher's bucket order: typed → domain wildcard → `'*'`
 * (agentfootprint `EventDispatcher.dispatch`).
 */
const DELIVERY_ORDER: readonly SubscriptionKind[] = ['typed', 'domain', 'all'];

/** The recording's `BoundaryEvents` entry, and whether it was readable. */
function readBoundaryEntry(snapshot: RecordedSnapshot | null | undefined): {
  events: readonly RecordedBoundaryEvent[];
  unreadable: boolean;
} {
  const recorders = Array.isArray(snapshot?.recorders) ? snapshot.recorders : [];
  const entry = recorders.find((r) => r?.name === BOUNDARY_ENTRY_NAME);
  if (entry === undefined) return { events: [], unreadable: false };
  if (!Array.isArray(entry.data)) return { events: [], unreadable: true };
  return { events: entry.data as readonly RecordedBoundaryEvent[], unreadable: false };
}

/**
 * THE STEP STRIP'S AXIS, READ BACK OUT OF THE RECORDING.
 *
 * Lens indexes its strip by COMMIT RANGES: which subflow (or composition) was
 * open across which slice of the commit log. Live, those ranges are opened and
 * closed by agentfootprint's `BoundaryRecorder` as the traversal crosses each
 * boundary. A replay has no traversal, so nothing opens them and the strip
 * collapses to a single dead step.
 *
 * The ranges are not lost, though — not if the run was recorded with a
 * `BoundaryRecorder` attached. Its snapshot entry (`BoundaryEvents`) carries
 * every entry/exit stamped with the commit index it happened at, which is
 * exactly what the index stores. So this replays those entry/exit pairs through
 * the index's own `open()` / `close()`, and Lens then builds its strip from its
 * own numbers with no help from the caller.
 *
 * WHAT THIS IS NOT: a derivation. The one thing the commit log cannot give back
 * is WHEN a boundary opened relative to the commits — a fork's branches all open
 * at one moment the log has no row for — so deriving ranges from the log yields
 * a strip that is close and wrong (measured on a real turn: 20 stops where the
 * run had 17, with phantom milestones and mis-anchored slots). There is
 * deliberately no fallback: either the turn recorded its boundaries or the strip
 * stays quiet and the UI says so.
 *
 * The commit indices are the recording's own and are replayed as found — a run
 * recorded without commit tracking wired into its boundary recorder stamped
 * zeros, and zeros is what comes back. Second-guessing them would be the same
 * derivation this function exists to refuse.
 *
 * @returns how many ranges the recorded events opened — `0` when the recording
 *   predates the capture, which is the note a pane switches on.
 */
function rebuildBoundaryIndex(
  recorder: LensRecorder,
  recorded: readonly RecordedBoundaryEvent[],
): number {
  const index = recorder.boundary.boundaryIndex;
  // The recording is the SOLE source of these ranges ON BOTH ARMS, so anything
  // already in the index goes — BEFORE the early exit below, not after it. The
  // typed replay opens composition ranges itself, at whatever `getCommitCount()`
  // reports, and offline that is the FINAL commit count for every event: a
  // zero-width slice at the end of the run. A recording of a Parallel/Sequence/
  // Loop/Conditional run with no `BoundaryEvents` entry is exactly the case that
  // leaves one behind, and "the recording captured no boundaries" has to mean an
  // EMPTY index, not an index holding stops nobody recorded.
  index.clear();

  const open = new Map<string, RangeToken>();
  let ranges = 0;

  for (const event of recorded) {
    const type = event?.type;
    if (typeof type !== 'string') continue;
    const opens = OPENS_A_RANGE.has(type);
    if (!opens && !CLOSES_A_RANGE.has(type)) continue;
    // A boundary with no commit index is a boundary with no position on the
    // axis — it was recorded without commit tracking. Skipping it is the only
    // honest option; placing it at 0 would fabricate a range.
    if (typeof event.commitIdxBefore !== 'number') continue;

    // Compositions are keyed by their own id: a composition's entry and exit
    // do not share a runtimeStageId (the enter/exit events fire from different
    // stages), which is how the live recorder pairs them too.
    const key =
      type === 'composition.start' || type === 'composition.end'
        ? typeof event.compositionId === 'string'
          ? `composition:${event.compositionId}`
          : ''
        : typeof event.runtimeStageId === 'string'
          ? event.runtimeStageId
          : '';
    if (key === '') continue;

    if (opens) {
      if (open.has(key)) continue; // already open — one range per boundary
      // The index stores a LABEL, and the label is the event minus its payload
      // — the same no-payload projection the live recorder stores, and the
      // reason a chip rendered from this index cannot leak a tool argument or
      // an LLM message.
      const { payload: _payload, kind, name, ...label } = event;
      const boundaryLabel =
        type === 'composition.start'
          ? {
              ...label,
              ...(isCompositionKind(kind) ? { compositionKind: kind } : {}),
              ...(typeof name === 'string' ? { compositionName: name } : {}),
            }
          : label;
      open.set(
        key,
        index.open(boundaryLabel as unknown as BoundaryRangeLabel, event.commitIdxBefore),
      );
      ranges += 1;
    } else {
      const token = open.get(key);
      if (token === undefined) continue;
      index.close(token, event.commitIdxBefore);
      open.delete(key);
    }
  }

  return ranges;
}

/**
 * THE STEP GRAPH, PUT BACK TOGETHER FROM BOTH HALVES OF THE RECORDING.
 *
 * The graph Lens renders (Agents list, hops, per-iteration detail) is
 * agentfootprint's ReAct projection over ONE flat `DomainEvent[]` — and live,
 * that array is fed by two channels at once: footprintjs's traversal
 * (`run`/`subflow`/`fork`/`decision`/`loop`) and the typed dispatcher
 * (`llm`/`tool`/`context`/`composition`). Offline only the second one runs, so
 * `recorder.getStepGraph()` fell back to the subflow-only projection and an
 * agent turn rendered as an EMPTY graph — measured: 0 nodes on a 4-iteration
 * ReAct turn, with no warning.
 *
 * Both halves survive, in different places: the traversal half is in the
 * recording's `BoundaryEvents` entry, and the typed half the replay just
 * rebuilt into `recorder.boundary`. Merged in timestamp order — both carry the
 * run's own `ts` — they are the array the live rail had. Measured on the same
 * turn: 21 nodes, the four ReAct iterations among them.
 *
 * The recording wins wherever it spoke: if it captured the typed half too (an
 * app that also called `boundary.subscribe(runner)`), the replay's copies are
 * dropped rather than interleaved, so a fully-captured recording is replayed
 * exactly as recorded.
 */
function replayStepGraph(
  recorder: LensRecorder,
  recorded: readonly RecordedBoundaryEvent[],
  onUnreadable: (text: string) => void,
): StepGraph | undefined {
  if (recorded.length === 0) return undefined;
  const recordedTyped = recorded.filter(
    (e) => typeof e?.type === 'string' && !FROM_THE_TRAVERSAL.has(e.type),
  );
  const typed: readonly DomainEvent[] =
    recordedTyped.length > 0
      ? (recordedTyped as unknown as readonly DomainEvent[])
      : recorder.boundary.getEvents();
  const fromTheRun = recorded.filter(
    (e) => typeof e?.type === 'string' && FROM_THE_TRAVERSAL.has(e.type),
  ) as unknown as readonly DomainEvent[];

  // Stable merge on the run's own clock: equal timestamps keep the order each
  // half was recorded in (a `sort` comparator alone would not promise that).
  const merged = [...fromTheRun, ...typed]
    .map((event, at) => ({ event, at }))
    .sort((a, b) => a.event.ts - b.event.ts || a.at - b.at)
    .map((d) => d.event);

  try {
    return buildStepGraphFromEvents(merged);
  } catch (err) {
    // The projection reads fields a well-formed boundary event always has
    // (`usage.input` on an `llm.end`, …). A truncated or hand-edited recording
    // can be missing one, and a chart that throws at render time is a blank
    // screen with no explanation. Fall through to the snapshot recorder's
    // subflow-only graph and SAY the detail is gone.
    onUnreadable(
      `The recording's boundary log could not be folded into a step graph (${
        err instanceof Error ? err.message : String(err)
      }) — the per-iteration detail is missing from this view.`,
    );
    return undefined;
  }
}

/**
 * Give a frozen recording to Lens.
 *
 * @param recording  a run's `{ snapshot, events, structure }` — whatever of the
 *   three the recording carries. Missing pieces degrade the view, never break
 *   it: no `events` is an empty log, no `snapshot` is no commit axis, no
 *   `structure` is no chart. A piece that is PRESENT but unreadable is never
 *   reported as missing — it comes back in `notes` (and on the recorder, so
 *   Lens shows it without being asked).
 * @param options    forwarded to the `LensRecorder` this builds (event cap,
 *   dev warnings) — same knobs as the live rail.
 *
 * @example
 * ```tsx
 * // Load once, observe once: each call replays the whole log and builds a
 * // fresh recorder, so keep it out of the render body.
 * const [recording, setRecording] = useState<Recording | undefined>();
 * useEffect(() => {
 *   fetch('/turns/42.json')
 *     .then((r) => r.json())
 *     .then(setRecording);
 * }, []);
 *
 * const observed = useMemo(
 *   () => (recording ? observeRecording(recording) : undefined),
 *   [recording],
 * );
 *
 * if (!observed) return <p>Loading…</p>;
 * return <Lens recorder={observed.recorder} runner={observed.runner} />;
 * ```
 */
export function observeRecording(
  recording: Recording,
  options?: LensRecorderOptions,
): ObservedRecording {
  const recorder = new LensRecorder('Run', options ?? {});
  // Every empty state, from here on, is a FINISHED run's empty state: "run a
  // sample to see what happened" is nonsense in front of a recording.
  recorder.markReplay();

  const notes: string[] = [];
  const debug = options?.debug ?? isDevMode();
  const note = (text: string): void => {
    notes.push(text);
    recorder.addNote(text);
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(`[agentfootprint-lens] ${text}`);
    }
  };

  // Every subscription the recorder (and the recorders it wires up in turn)
  // opens, in the order it opened them. Delivery re-buckets them — see
  // `deliver` below.
  const listeners: ReplayListener[] = [];

  /**
   * Hand ONE event to the listeners, the way agentfootprint's dispatcher does:
   * the typed bucket first, then the domain wildcard, then `'*'`, keeping
   * registration order WITHIN each bucket (`EventDispatcher.dispatch`).
   *
   * The order matters for a debugger standing in for the live rail:
   * `LensRecorder.observe` registers its `on('*')` FIRST, so delivering in
   * plain registration order would run the wildcard ahead of every typed
   * listener — inverted from live, and a fidelity claim this file should not
   * be making falsely.
   *
   * @returns `true` when at least one handler threw on this event.
   */
  const deliver = (event: AgentfootprintEvent): boolean => {
    let threw = false;
    const type = typeof event?.type === 'string' ? event.type : '';
    for (const kind of DELIVERY_ORDER) {
      // Snapshot the list per pass: a handler that unsubscribes mid-delivery
      // must not shift the ones behind it out of this event.
      for (const listener of listeners.slice()) {
        if (listener.kind !== kind) continue;
        if (!hears(listener.type, type)) continue;
        // One-shot listeners are dropped BEFORE they run, exactly as the
        // dispatcher drops them — so a handler that re-subscribes from inside
        // itself is not cancelled by its own removal.
        if (listener.once) {
          const at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        }
        // footprintjs's own invariant, kept on the replay rail: a recorder that
        // throws never aborts the run feeding it. A replay IS that run played
        // back, so one event a handler cannot read costs that event and nothing
        // else — it is skipped, counted, and reported.
        try {
          listener.handler(event);
        } catch (err) {
          threw = true;
          if (debug) {
            // The live rail names WHICH listener and WHICH type threw
            // (agentfootprint's dispatcher does, in dev mode). A bare count
            // tells you how many events you lost and never which.
            // eslint-disable-next-line no-console
            console.error(
              `[agentfootprint-lens] Replay listener for "${listener.type}" threw on "${type || '(no type)'}":`,
              err,
            );
          }
        }
      }
    }
    return threw;
  };

  const rawSnapshot = recording.snapshot;
  const snapshot =
    rawSnapshot === null || rawSnapshot === undefined
      ? undefined
      : typeof rawSnapshot === 'object'
        ? rawSnapshot
        : undefined;
  if (rawSnapshot !== null && rawSnapshot !== undefined && snapshot === undefined) {
    note(
      `The recording's "snapshot" is a ${typeof rawSnapshot}, not an object — no commit axis, no provenance. If it was stored as JSON text, parse it before passing it in.`,
    );
  }

  const subscribe = (
    type: string,
    handler: (event: AgentfootprintEvent) => void,
    listenOptions?: { once?: boolean; signal?: AbortSignal },
  ): Unsubscribe => {
    const listener: ReplayListener = {
      type,
      kind: subscriptionKind(type),
      handler,
      once: listenOptions?.once === true,
    };
    listeners.push(listener);
    const unsubscribe = (): void => {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    };
    listenOptions?.signal?.addEventListener('abort', unsubscribe, { once: true });
    return unsubscribe;
  };

  const boundaryEntry = readBoundaryEntry(snapshot);
  const boundaryEvents = boundaryEntry.events;
  if (boundaryEntry.unreadable) {
    note(
      `The recording has a "${BOUNDARY_ENTRY_NAME}" entry whose data is not an array — the step strip stays quiet, but this run DID record boundaries. They are unreadable, not absent.`,
    );
  }

  // The chart the recording froze, under either of the two names it is stored
  // under in this ecosystem.
  const structure = recording.structure ?? recording.blueprint;

  // The step graph is derived lazily and cached: `enable.flowchart()` is called
  // during `recorder.observe()` — BEFORE the events are replayed — so building
  // eagerly here would fold an empty log.
  let stepGraph: StepGraph | undefined;
  let stepGraphBuilt = false;

  // A runner whose only job is subscription plumbing. `recorder.observe()`
  // wants a live agent; the four things it actually reaches for are the
  // dispatcher (`on`), the recorder channel (`attach`), the step-graph handle
  // (`enable.flowchart`) and the run's snapshot — and a recording can answer
  // all four. Cast once, here, rather than in every consumer: implementing the
  // rest of `Runner` (run / resume / …) would be inventing behaviour a
  // recording does not have.
  const runner = {
    on: subscribe,
    off(): void {},
    once: (
      type: string,
      handler: (event: AgentfootprintEvent) => void,
      listenOptions?: { signal?: AbortSignal },
    ): Unsubscribe => subscribe(type, handler, { ...listenOptions, once: true }),
    removeAllListeners(): void {
      listeners.length = 0;
    },
    listenerCount(): number {
      return listeners.length;
    },
    // footprintjs's FlowRecorder channel is a LIVE traversal channel. A
    // recording has no traversal, so an attached recorder simply never hears
    // anything — accepted and dropped, rather than pretended.
    attach(): Unsubscribe {
      return () => {};
    },
    enable: {
      flowchart: () => ({
        getSnapshot: (): StepGraph | undefined => {
          if (!stepGraphBuilt) {
            stepGraphBuilt = true;
            stepGraph = replayStepGraph(recorder, boundaryEvents, note);
          }
          return stepGraph;
        },
        boundary: recorder.boundary,
        unsubscribe(): void {},
      }),
    },
    getLastSnapshot: () => snapshot,
    getSpec: () => ({ buildTimeStructure: structure }),
    // A recording generates nothing new, but handing an event in still means
    // what it means live: deliver it to the listeners, in the dispatcher's
    // order. That is how a consumer feeds a late-arriving event (or a test
    // watches the routing) through the same plumbing the replay used, instead
    // of the call disappearing without a word.
    emit(event: AgentfootprintEvent): void {
      deliver(event);
    },
  } as unknown as Runner;

  // Deliberately not unsubscribed: the recorder keeps reaching through this
  // runner for the run's commit log long after the replay is over, which is how
  // the strip and the provenance panel read the recording. `recorder.detach()`
  // ends it when the consumer is done.
  recorder.observe(runner);

  // The runtime overlay, recovered from the commit log. Live, `observe()`
  // attaches `recorder.runtime.recorder` to footprintjs's FlowRecorder channel
  // and every executed stage lands as a step; on this replay runner `attach()`
  // is a no-op (see above), so without this the overlay is empty and the chart
  // never lights the executed path or the cursor's current node. The commit
  // log holds the same order the channel would have fired — one bundle per
  // executed stage, `runtimeStageId` spelled exactly as the cursor spells it —
  // so eui's own post-hoc twin (`overlayFromSnapshot`) rebuilds the overlay
  // and the handle adopts it. `seed` is guarded call-time (house TRUE-ESM
  // pattern): an older explainable-ui inside the declared peer range simply
  // keeps today's unlit chart instead of crashing the replay.
  if (snapshot !== undefined && typeof recorder.runtime.seed === 'function') {
    const rebuiltOverlay = overlayFromSnapshot(snapshot);
    if (rebuiltOverlay.executionOrder.length > 0) recorder.runtime.seed(rebuiltOverlay);
  }

  // A recording arrives as parsed JSON from wherever it was stored, so the log
  // is whatever is actually there — not whatever the type says.
  const rawEvents = recording.events;
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  if (rawEvents !== null && rawEvents !== undefined && !Array.isArray(rawEvents)) {
    note(
      `The recording's "events" is a ${typeof rawEvents}, not an array — nothing was replayed. If the log was stored as JSON text, parse it before passing it in.`,
    );
  }

  let eventsSkipped = 0;
  for (const event of events) {
    if (deliver(event)) eventsSkipped += 1;
  }

  const boundaryRanges = rebuildBoundaryIndex(recorder, boundaryEvents);

  const chart: 'drawn' | 'absent' =
    structure === undefined || structure === null ? 'absent' : 'drawn';
  if (chart === 'absent') {
    note(
      'This recording carried no chart. Capture `runner.getSpec().buildTimeStructure` at record time and save it as `structure` — nothing else can draw the composition.',
    );
  }
  if (boundaryRanges === 0) {
    note(
      'This recording has no step boundaries — the grouped reading has nothing to band, though every commit still scrubs. Attach agentfootprint’s boundary recorder at record time to get the groups.',
    );
  }
  if (eventsSkipped > 0) {
    note(
      `${eventsSkipped} of ${events.length} recorded events could not be read and were skipped — the rest of the run is intact.`,
    );
  }

  return {
    recorder,
    // No chart, no runner: `<Lens>` reads `runner.getSpec()` to draw the
    // composition, and a spec with nothing in it draws nothing.
    runner: chart === 'absent' ? undefined : runner,
    chart,
    eventsReplayed: events.length,
    eventsSkipped,
    boundaryEvents: boundaryEvents.length,
    boundaryRanges,
    notes,
  };
}
