/**
 * <SkillGraphDebugger> — the skill graph, with the run replayed across it.
 *
 *   <SkillGraphDebugger
 *     recorder={recorder}
 *     cursorRuntimeStageId={cursor}
 *     onJumpTo={(id) => moveTheLensCursorTo(id)}
 *   />
 *
 * `<SkillGraphFlow>` draws the graph an author BUILT. This draws the graph a
 * run WALKED: the declared topology with the run's cursor on it, why the
 * cursor moved at each stop, what the model was looking at when it decided,
 * and the same run told as a story that reveals with time.
 *
 * ONE CURSOR, ONE TRANSPORT — the transport under the beat rail is
 * `<TimeTravel>`, the component `<Lens>` itself mounts, not a lookalike. Pass
 * `step` / `totalSteps` / `onStepChange` (the `<Lens>` grammar) and it scrubs
 * the host's own axis with the host's own numbers; omit them and it scrubs
 * this view's routing stops. Either way it is the shipped slider.
 *
 * SHARING AN AXIS IS NOT SHARING A STRIDE. The host's axis is the RUN's: a
 * four-tool turn puts 73 stops on it, and this view changes at eight. Pass
 * `snapSteps` — the steps this view's picture changes at, in the host's own
 * numbers — and ◀ ▶ walk those instead of walking framework stages that change
 * nothing here. The cursor, the axis and the numbers all stay the host's; the
 * slider still reaches every position; only the step buttons' landing set
 * narrows, and the readout says when the cursor is standing between two stops.
 *
 * THE ONE-CURSOR LAW — the rule this component is shaped by. The lens has one
 * time cursor (`memory/lens_v0_1_one_cursor_architecture.md`), and this view
 * SCRUBS AND FILTERS it. It holds no position: the beat being shown is
 * resolved from `cursorRuntimeStageId` on every render by `selectSkillBeatAt`,
 * and every mover here — the transport, a beat, a narrative paragraph, a click
 * on a skill node — reports a `runtimeStageId` through `onJumpTo` and waits to
 * be told where the cursor went. Give it a cursor that never moves and the
 * view never moves, which is the correct behaviour for a controlled component
 * whose owner ignored it.
 *
 * WIRED INTO `<Lens>`: mount it in the detail slot and forward the props the
 * slot already hands you — that is the whole integration.
 *
 *   // The host holds ONE navigator, on <Lens> — this view owns no axis, so it
 *   // reports an ADDRESS and lets the cursor's owner resolve it.
 *   const nav = useRef<LensNavigator>(null);
 *
 *   const detail = (p: LensDetailSlotProps) => (
 *     <SkillGraphDebugger
 *       recorder={p.recorder}
 *       cursorRuntimeStageId={p.cursorRuntimeStageId}
 *       cursorKind={p.kind}
 *       step={p.step}
 *       totalSteps={p.totalSteps}
 *       onStepChange={p.onNavigate}
 *       onJumpTo={(id) => nav.current?.navigateTo(id)}
 *     />
 *   );
 *   <Lens recorder={recorder} navigatorRef={nav} slots={{ detail }} />
 *
 * `navigateTo` hands back `{ ok: false, nearest }` when the host's ruler has
 * no stop for that beat, so the host can OFFER the nearest earlier stop
 * instead of jumping somewhere the person did not ask for. (The older
 * `stepForRuntimeStageId(positions, id)` + `p.onNavigate(step)` wiring still
 * works and is still supported — it simply takes that offer silently.)
 *
 * The two lenses are one data path (see `./lens.ts`): the developer lens shows
 * the record, the product lens shows the library's sentences for the same
 * record, accumulated to the cursor. Neither can show a fact the other cannot.
 */

import React, { useMemo, useRef, useState } from 'react';

import type { LensRecorder } from '../../core/LensRecorder.js';
import {
  selectSkillBeatAt,
  selectSkillBeats,
  type SkillBeat,
} from '../../core/selectors/selectSkillBeats.js';
import { selectSkillFrameContext } from '../../core/selectors/selectSkillFrameContext.js';
import { selectSkillRoute, type SkillRoute } from '../../core/selectors/selectSkillRoute.js';
import {
  selectSkillTopology,
  type DeclaredEdgeInput,
} from '../../core/selectors/selectSkillTopology.js';
import { DoorRefusalCard } from '../../doors/DoorRefusalCard.js';
import {
  REFUSAL_GO_TO,
  describeReceived,
  refusalDestinationFor,
} from '../../doors/recordingInput.js';
import { useNarrowRow } from '../narrowLayout.js';
import { T } from '../theme/index.js';
import { BeatStrip, type BeatTransport } from './BeatStrip.js';
import { FrameFactsPanel } from './FrameFactsPanel.js';
import { NarrativeRail } from './NarrativeRail.js';
import { RouteDecisionCard } from './RouteDecisionCard.js';
import { SkillTopologyCanvas } from './SkillTopologyCanvas.js';
import type { SkillLens } from './lens.js';

/** Sentence 1 of the door's refusal — what the Skill Graph debugger reads. */
export const SKILL_GRAPH_READS =
  'a replayed recording — the recorder that observeRecording(recording) returns, or a live lensRecorder()';

export interface SkillGraphDebuggerProps {
  /** The recording. Everything is folded from its event log + step graph. */
  readonly recorder?: LensRecorder;
  /** A pre-folded routing record, for a host that already computed one.
   *  Wins over `recorder` for the routing facts; `recorder` is still read for
   *  the step graph that pairs a beat with the call it prepared. */
  readonly route?: SkillRoute;
  /** THE cursor — a `runtimeStageId`, the lens's own address space. */
  readonly cursorRuntimeStageId: string;
  /** The kind of stop the cursor is on, when the host knows it (`'group-start'`
   *  / `'group-end'` / `'user-in'` / `'user-out'`). Resolves the run's bookends. */
  readonly cursorKind?: string;
  /** Move THE cursor. Without it the view is read-only — every mover still
   *  renders, and none of them changes anything. */
  readonly onJumpTo?: (runtimeStageId: string) => void;
  /**
   * The host's cursor on its own step axis — `<Lens step onStepChange>`'s
   * grammar, and the same two numbers. Pass them and the shipped transport
   * (`<TimeTravel>`) scrubs the SAME axis the lens's own transport does, with
   * the same numbers; omit them and it scrubs this view's routing stops.
   *
   * Either way there is one cursor and one transport COMPONENT: this view
   * never re-implements the slider, it mounts the shipped one.
   */
  readonly step?: number;
  readonly totalSteps?: number;
  readonly onStepChange?: (step: number) => void;
  /**
   * SNAP STOPS — the positions on the HOST's axis that ◀ ▶ and ← → may land
   * on. Ascending, in the same units as `step` / `totalSteps`.
   *
   * Why a host needs this: sharing the host's axis is the one-cursor law
   * working correctly, but the host's axis is the RUN's, not this view's. A
   * four-tool turn can put 73 stops on it while the routing picture changes at
   * eight — so scrubbing spends 65 presses walking framework stages that
   * change nothing here. Hand the steps this view actually changes at and the
   * transport walks those; everything else about it is unchanged.
   *
   * The host builds the list, because the host owns the axis — the mapping is
   * `stepForRuntimeStageId(positions, beat.runtimeStageId)` over
   * `selectSkillBeats`, both already exported from this door.
   *
   * IGNORED when this view scrubs its OWN routing stops (no `step` /
   * `totalSteps`): every routing stop already changes the picture, so there is
   * nothing to narrow. Absent ⇒ byte-identical to today.
   *
   * @example
   * ```tsx
   * const beats = selectSkillBeats({ route: selectSkillRoute({ log }) });
   * const snapSteps = [...new Set(beats
   *   .map((b) => (b.runtimeStageId !== undefined
   *     ? stepForRuntimeStageId(positions, b.runtimeStageId) : -1))
   *   .filter((s) => s >= 0))].sort((a, b) => a - b);
   * ```
   */
  readonly snapSteps?: readonly number[];
  /**
   * Whether this view's transport owns ← → Home End. Defaults to `true` when
   * it is the page's only transport and `false` when the host passed its own
   * axis (a hosted view sits beside the host's transport, and two bound
   * transports move the one cursor twice per press).
   */
  readonly transportKeyboard?: boolean;
  /**
   * The author's declared edges, from the BUILT graph
   * (`graph.edges.filter((e) => e.from !== null)`). A recording names an edge
   * only once it fires, so without this the declared topology is a lower
   * bound — and the canvas says so rather than implying otherwise.
   */
  readonly declaredEdges?: readonly DeclaredEdgeInput[];
  /** Controlled lens. */
  readonly lens?: SkillLens;
  /** Uncontrolled initial lens. Ignored when `lens` is set. */
  readonly defaultLens?: SkillLens;
  readonly onLensChange?: (lens: SkillLens) => void;
  readonly height?: number | string;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

export function SkillGraphDebugger({
  recorder,
  route: routeProp,
  cursorRuntimeStageId,
  cursorKind,
  onJumpTo,
  step,
  totalSteps,
  onStepChange,
  snapSteps,
  transportKeyboard,
  declaredEdges,
  lens: lensProp,
  defaultLens = 'developer',
  onLensChange,
  height = '100%',
  className,
  style,
}: SkillGraphDebuggerProps): React.ReactElement {
  const [internalLens, setInternalLens] = useState<SkillLens>(defaultLens);
  const lens = lensProp ?? internalLens;
  const pickLens = (next: SkillLens): void => {
    if (lensProp === undefined) setInternalLens(next);
    onLensChange?.(next);
  };

  const rowRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrowRow(rowRef);

  // THE DOOR'S GATE (`agentfootprint-lens/skillgraph`): `recorder` is TYPED
  // LensRecorder — TypeScript consumers fail at build time — but a JS consumer
  // can hand this prop anything. A wrong shape renders the teaching refusal
  // card below (never a crash on `.getVersion()`), and every hook after this
  // line reads the vetted handle so the hook order never changes.
  const recorderRefused =
    recorder !== undefined &&
    (typeof (recorder as { getVersion?: unknown }).getVersion !== 'function' ||
      typeof (recorder as { selectEventLog?: unknown }).selectEventLog !== 'function');
  const vettedRecorder = recorderRefused ? undefined : recorder;

  // `getVersion()` is the recorder's monotonic change stamp — the fold reruns
  // when the run advances, and not on every render of a finished one.
  const version = vettedRecorder?.getVersion() ?? 0;
  const route = useMemo(
    () =>
      routeProp ??
      (vettedRecorder !== undefined
        ? selectSkillRoute({ log: vettedRecorder.selectEventLog() })
        : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeProp, vettedRecorder, version],
  );

  const beats = useMemo(
    () => (route !== undefined ? selectSkillBeats({ route }) : []),
    [route],
  );
  const activeBeat = useMemo(
    () => selectSkillBeatAt(beats, cursorRuntimeStageId, cursorKind),
    [beats, cursorRuntimeStageId, cursorKind],
  );
  const activeIndex = activeBeat?.index;

  const topology = useMemo(
    () =>
      route !== undefined
        ? selectSkillTopology({
            route,
            ...(activeBeat !== undefined ? { beat: activeBeat } : {}),
            ...(declaredEdges !== undefined ? { declaredEdges } : {}),
          })
        : undefined,
    [route, activeBeat, declaredEdges],
  );

  // Pairing a beat with the call it prepared needs the step graph; a host that
  // passed only a pre-folded route has none, and the panel says so.
  const frameContext = useMemo(() => {
    if (vettedRecorder === undefined || activeBeat === undefined) return undefined;
    const next = beats[activeBeat.index + 1];
    return selectSkillFrameContext({
      graph: vettedRecorder.getStepGraph(),
      beat: activeBeat,
      ...(next !== undefined ? { nextBeat: next } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vettedRecorder, version, activeBeat, beats]);

  /** Skills the cursor stood in at some beat — the clickable ones. */
  const jumpable = useMemo(() => {
    const ids = new Set<string>();
    for (const b of beats) {
      if (b.cursorSkillId !== undefined && b.runtimeStageId !== undefined) ids.add(b.cursorSkillId);
    }
    return ids;
  }, [beats]);

  /**
   * What the shipped transport scrubs. The host's axis when it gave us one —
   * the same numbers its own `<TimeTravel>` shows — otherwise this view's
   * routing stops. In BOTH cases the position is DERIVED (from the host's
   * `step`, or from where the cursor resolved) and a scrub reports a move
   * back out; nothing is stored here.
   */
  const hostAxis = step !== undefined && totalSteps !== undefined && totalSteps > 0;
  const transport: BeatTransport = {
    total: hostAxis ? totalSteps : beats.length,
    focus: hostAxis ? step : (activeIndex ?? 0),
    onFocusChange: (position: number): void => {
      if (hostAxis) {
        onStepChange?.(position);
        return;
      }
      const id = beats[position]?.runtimeStageId;
      if (id !== undefined) onJumpTo?.(id);
    },
    keyboard: transportKeyboard ?? !hostAxis,
    axisLabel: hostAxis ? 'the run' : 'routing stops',
    // Snap stops are a HOST-AXIS notion: they are steps on the axis the host
    // handed us. Without one the transport is already scrubbing this view's
    // routing stops — every one of which changes the picture — so there is
    // nothing to narrow and the list is not forwarded.
    ...(hostAxis && snapSteps !== undefined ? { snapSteps } : {}),
  };

  /** Filter the ONE cursor to a skill's next span, wrapping to its first. */
  const jumpToSkill = (skillId: string): void => {
    const spans = beats.filter(
      (b) => b.cursorSkillId === skillId && b.runtimeStageId !== undefined,
    );
    if (spans.length === 0) return;
    const from = activeIndex ?? -1;
    const next = spans.find((b) => b.index > from) ?? spans[0];
    if (next?.runtimeStageId !== undefined) onJumpTo?.(next.runtimeStageId);
  };

  const shell: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height,
    width: '100%',
    minHeight: 0,
    background: T.bgPrimary,
    color: T.textPrimary,
    fontFamily: T.fontSans,
    ...style,
  };

  if (recorderRefused) {
    return (
      <div className={className} style={shell} data-testid="skill-graph-debugger">
        <Header lens={lens} onPick={pickLens} subtitle="the recorder prop is not a recorder" />
        <DoorRefusalCard
          door="Skill Graph"
          reads={SKILL_GRAPH_READS}
          received={describeReceived(recorder)}
          goTo={
            refusalDestinationFor(recorder) === 'commit-trace-lens'
              ? REFUSAL_GO_TO['commit-trace-lens']
              : 'Replay the recording first — observeRecording(recording).recorder (or a live lensRecorder()) is what this prop wants.'
          }
        />
      </div>
    );
  }

  if (route === undefined) {
    return (
      <div className={className} style={shell} data-testid="skill-graph-debugger">
        <Header lens={lens} onPick={pickLens} subtitle="no recording was supplied" />
        <Empty>
          Pass a <code>recorder</code> (or a pre-folded <code>route</code>) — this view renders a
          recording, it does not run anything.
        </Empty>
      </div>
    );
  }

  if (!route.hasRouting) {
    return (
      <div className={className} style={shell} data-testid="skill-graph-debugger">
        <Header lens={lens} onPick={pickLens} subtitle="this run did not route through skills" />
        <Empty>
          No skill graph ran here: the recording carries no skill catalog, no cursor move and no
          refusal. Nothing is hidden — there is nothing to draw. The run itself is still fully
          readable — the Why Lens (<code>agentfootprint-lens/why</code>) replays every recording,
          skills or not.
        </Empty>
      </div>
    );
  }

  return (
    <div className={className} style={shell} data-testid="skill-graph-debugger">
      <Header
        lens={lens}
        onPick={pickLens}
        subtitle={
          lens === 'product'
            ? 'How the assistant found its way through the playbook'
            : `${route.nodes.length} skills · ${beats.length} routing stops · ${route.observedEdges.length} hops taken`
        }
      />

      <div
        ref={rowRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.15fr) minmax(300px, 0.85fr)',
          gridTemplateRows: narrow ? 'minmax(240px, 1fr) minmax(200px, 1fr)' : '1fr',
        }}
      >
        <section
          style={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: narrow ? 'none' : `1px solid ${T.border}`,
            borderBottom: narrow ? `1px solid ${T.border}` : 'none',
          }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            {topology !== undefined && (
              <SkillTopologyCanvas
                topology={topology}
                lens={lens}
                jumpable={jumpable}
                onPickSkill={jumpToSkill}
              />
            )}
          </div>
          <RouteDecisionCard {...(activeBeat !== undefined ? { beat: activeBeat } : {})} lens={lens} />
        </section>

        <section style={{ minHeight: 0 }}>
          {lens === 'product' ? (
            <NarrativeRail
              beats={beats}
              {...(activeIndex !== undefined ? { activeIndex } : {})}
              {...(onJumpTo !== undefined ? { onJumpTo } : {})}
            />
          ) : (
            <FrameFactsPanel
              {...(activeBeat !== undefined ? { beat: activeBeat } : {})}
              {...(frameContext !== undefined ? { frameContext } : {})}
            />
          )}
        </section>
      </div>

      <BeatStrip
        beats={beats}
        {...(activeIndex !== undefined ? { activeIndex } : {})}
        lens={lens}
        transport={transport}
        {...(onJumpTo !== undefined ? { onJumpTo } : {})}
      />
    </div>
  );
}

function Header({
  lens,
  onPick,
  subtitle,
}: {
  lens: SkillLens;
  onPick: (lens: SkillLens) => void;
  subtitle: string;
}): React.ReactElement {
  const tab = (value: SkillLens, label: string): React.ReactElement => (
    <button
      type="button"
      role="tab"
      aria-selected={lens === value}
      data-testid={`lens-tab-${value}`}
      onClick={() => onPick(value)}
      style={{
        minWidth: 84,
        padding: '5px 10px',
        borderRadius: 6,
        border: 'none',
        background: lens === value ? T.bgTertiary : 'transparent',
        boxShadow: lens === value ? `inset 0 0 0 1px ${T.primary}` : 'none',
        color: lens === value ? T.textPrimary : T.textSecondary,
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bgPrimary,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>Skill routing</div>
        <div style={{ fontSize: 11, color: T.textMuted }}>{subtitle}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div
        role="tablist"
        aria-label="Explanation lens"
        style={{
          display: 'inline-flex',
          gap: 3,
          padding: 3,
          borderRadius: 9,
          border: `1px solid ${T.border}`,
          background: T.bgSecondary,
        }}
      >
        {tab('product', 'Product lens')}
        {tab('developer', 'Developer lens')}
      </div>
    </header>
  );
}

function Empty({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: T.textMuted }}>{children}</p>
    </div>
  );
}
