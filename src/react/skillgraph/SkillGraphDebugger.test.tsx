/**
 * <SkillGraphDebugger> — render + interaction, over the REAL recording.
 *
 * Driven by `__fixtures__/skill-route-refusal.json` (a frozen run of the real
 * library, not a hand-written log), so what these tests assert is what a
 * reader actually sees for a refused hop.
 *
 * xyflow needs real layout to place edges; jsdom has none, so — the
 * `<SkillGraphFlow>` convention — these assert the React-owned surface (node
 * labels and states, the card's facts, the rail's accumulation, the movers'
 * callbacks) and leave geometry to `skillTopologyPositions.test.ts`. Native
 * vitest matchers only, per the repo.
 *
 * The load-bearing arm is THE ONE-CURSOR LAW: with the cursor prop held still,
 * no click may change what is shown. A view that moved itself would pass every
 * other test here and still be the bug this design exists to prevent.
 */

/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { observeRecording, type Recording } from '../../core/observeRecording.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import { SkillGraphDebugger } from './SkillGraphDebugger.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', '__fixtures__');

/** The four evaluate stages of the fixture's one turn, in order. */
const AT_ENTRY = 'sf-injection-engine/evaluate#3';
const AT_STAY = 'sf-injection-engine/evaluate#26';
const AT_PICK = 'sf-injection-engine/evaluate#49';
const AT_ROUTE = 'sf-injection-engine/evaluate#72';

function recorderFor(file = 'skill-route-refusal.json'): LensRecorder {
  const recording = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Recording;
  return observeRecording(recording).recorder;
}

describe('<SkillGraphDebugger> — the graph at the cursor', () => {
  it('paints every skill with the state it is in at this beat', () => {
    render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_ENTRY} height={600} />,
    );
    expect(screen.getByTestId('skill-node-triage').getAttribute('data-state')).toBe('current');
    // The gate refused this pick HERE — a state the run's history alone cannot show.
    expect(screen.getByTestId('skill-node-audit-log').getAttribute('data-state')).toBe('refused');
    // Named by `skill.rejected.allowed` — the only typed reachable list on the record.
    expect(screen.getByTestId('skill-node-volume-lookup').getAttribute('data-state')).toBe(
      'reachable',
    );
  });

  it('moves those states as the cursor moves', () => {
    const { rerender } = render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_ENTRY} height={600} />,
    );
    rerender(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_PICK} height={600} />,
    );
    expect(screen.getByTestId('skill-node-volume-lookup').getAttribute('data-state')).toBe('current');
    expect(screen.getByTestId('skill-node-triage').getAttribute('data-state')).toBe('visited');
  });

  it('says the declared topology is only what the recording named', () => {
    render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_ROUTE} height={600} />,
    );
    const legend = screen.getByTestId('skill-topology-legend');
    expect(within(legend).getByText(/only the ones this recording named/i)).toBeTruthy();
  });

  it('drops that caveat when the author\'s own edges are supplied', () => {
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ROUTE}
        declaredEdges={[{ from: 'triage', to: 'volume-lookup' }]}
        height={600}
      />,
    );
    const legend = screen.getByTestId('skill-topology-legend');
    expect(within(legend).queryByText(/only the ones this recording named/i)).toBeNull();
  });
});

describe('<SkillGraphDebugger> — the route-decision card', () => {
  it('shows the cause and the refusal, with what the cursor did next', () => {
    render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_ENTRY} height={600} />,
    );
    const card = screen.getByTestId('route-decision-card');
    expect(within(card).getByTestId('route-cause').textContent).toBe('entry');

    const refusal = within(card).getByTestId('route-refusal');
    expect(refusal.textContent).toContain('audit-log');
    // The gate's own reachability set, from `skill.rejected.allowed`.
    expect(within(refusal).getByText(/reachable instead/i)).toBeTruthy();
    // Verbatim — the sentence the MODEL read back, not a paraphrase of it.
    expect(
      within(refusal).getByText(
        'read_skill("audit-log") is not reachable from here. Reachable skills: volume-lookup. Pick one of these, or finish.',
      ),
    ).toBeTruthy();
    // The one-iteration lag, rendered as the fact it is.
    expect(within(refusal).getByText(/Next iteration \(2\): the cursor did not move/)).toBeTruthy();
  });

  it('renames the cause for the product reader without changing it', () => {
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ROUTE}
        defaultLens="product"
        height={600}
      />,
    );
    expect(screen.getByTestId('route-cause').textContent).toBe("the author's edge fired");
  });
});

describe('<SkillGraphDebugger> — the developer frame panel', () => {
  it('shows the read_skill menu verbatim and states what is NOT recorded', () => {
    render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_STAY} height={600} />,
    );
    const panel = screen.getByTestId('frame-facts');
    const menu = within(panel).getByTestId('read-skill-description');
    expect(menu.textContent).toContain('Reachable from here');
    expect(menu.textContent).toContain('Not reachable from here');

    const absence = within(panel).getByTestId('frame-absence');
    expect(absence.textContent).toContain('system prompt as one assembled string is not recorded');
    expect(absence.textContent).toContain('reachable set is not recorded as data');
  });
});

describe('<SkillGraphDebugger> — the product lens', () => {
  it('reveals the library\'s sentences with the cursor, accumulating', () => {
    const { rerender } = render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        lens="product"
        height={600}
      />,
    );
    const rail = () => screen.getByTestId('narrative-rail');
    expect(within(rail()).queryAllByTestId(/narrative-beat-/)).toHaveLength(1);
    expect(within(rail()).getByTestId('narrative-beat-0').textContent).toContain(
      'Started in "triage"',
    );

    rerender(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_PICK}
        lens="product"
        height={600}
      />,
    );
    const beats = within(rail()).queryAllByTestId(/narrative-beat-/);
    expect(beats).toHaveLength(3);
    // Earlier paragraphs stay; the newest is the emphasized one.
    expect(beats[0]!.getAttribute('data-newest')).toBe('false');
    expect(beats[2]!.getAttribute('data-newest')).toBe('true');
    expect(beats[2]!.textContent).toContain('The model chose "volume-lookup"');

    // Scrubbing back hides the later paragraphs again — a replay, not a log.
    rerender(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        lens="product"
        height={600}
      />,
    );
    expect(within(rail()).queryAllByTestId(/narrative-beat-/)).toHaveLength(1);
  });

  it('switches lenses without touching the cursor', () => {
    const onJumpTo = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_PICK}
        onJumpTo={onJumpTo}
        height={600}
      />,
    );
    expect(screen.getByTestId('frame-facts')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lens-tab-product'));
    expect(screen.getByTestId('narrative-rail')).toBeTruthy();
    expect(screen.queryByTestId('frame-facts')).toBeNull();
    expect(onJumpTo).not.toHaveBeenCalled();
  });
});

describe('<SkillGraphDebugger> — THE ONE-CURSOR LAW', () => {
  it('every mover reports a runtimeStageId and moves nothing itself', () => {
    const onJumpTo = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        onJumpTo={onJumpTo}
        height={600}
      />,
    );

    // The SHIPPED transport (`<TimeTravel>`, the one `<Lens>` mounts — this
    // view does not own a slider of its own)…
    fireEvent.click(screen.getByTitle('Next step (→)'));
    expect(onJumpTo).toHaveBeenLastCalledWith(AT_STAY);

    // …a beat…
    fireEvent.click(screen.getByTestId('beat-3'));
    expect(onJumpTo).toHaveBeenLastCalledWith(AT_ROUTE);

    // …and a skill node, which FILTERS the cursor to that skill's next span.
    fireEvent.click(screen.getByTestId('skill-node-volume-lookup'));
    expect(onJumpTo).toHaveBeenLastCalledWith(AT_PICK);

    // …and after all of it, the view still shows the beat the CURSOR names.
    expect(screen.getByTestId('beat-0').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('skill-node-triage').getAttribute('data-state')).toBe('current');
    expect(onJumpTo).toHaveBeenCalledTimes(3);
  });

  it('a skill the cursor never stood in is not a jump target', () => {
    const onJumpTo = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        onJumpTo={onJumpTo}
        declaredEdges={[{ from: 'triage', to: 'inventory' }]}
        height={600}
      />,
    );
    fireEvent.click(screen.getByTestId('skill-node-inventory'));
    expect(onJumpTo).not.toHaveBeenCalled();
  });

  it('resolves a cursor that is not a routing stop to the stop in effect there', () => {
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={'call-llm#60'}
        height={600}
      />,
    );
    // #60 sits between the pick (#49) and the route (#72) → the pick is in effect.
    expect(screen.getByTestId('beat-2').getAttribute('data-active')).toBe('true');
  });

  it('renders read-only when no onJumpTo is given', () => {
    render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_ENTRY} height={600} />,
    );
    fireEvent.click(screen.getByTestId('beat-2'));
    expect(screen.getByTestId('beat-0').getAttribute('data-active')).toBe('true');
  });
});

describe('<SkillGraphDebugger> — honest degrades', () => {
  it('says a run without a skill graph had none, instead of drawing an empty one', () => {
    // `recorded-turn.json` is a plain ReAct turn: no catalog, no cursor move.
    render(
      <SkillGraphDebugger
        recorder={recorderFor('recorded-turn.json')}
        cursorRuntimeStageId=""
        height={600}
      />,
    );
    expect(screen.getByText(/No skill graph ran here/i)).toBeTruthy();
    expect(screen.queryByTestId('skill-topology')).toBeNull();
  });

  it('asks for a recording when it was given none', () => {
    render(<SkillGraphDebugger cursorRuntimeStageId="" height={600} />);
    expect(screen.getByText(/this view renders a recording/i)).toBeTruthy();
  });

  it('before the first routing stop, says nothing has been decided', () => {
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId="__root__#0"
        cursorKind="group-start"
        height={600}
      />,
    );
    expect(
      within(screen.getByTestId('route-decision-card')).getByText(/nothing has been decided yet/i),
    ).toBeTruthy();
    // The graph still draws — every node idle, nothing claimed.
    expect(screen.getByTestId('skill-node-triage').getAttribute('data-state')).toBe('idle');
  });
});

describe('<SkillGraphDebugger> — ONE CURSOR, ONE TRANSPORT', () => {
  it('mounts the lens\'s shipped <TimeTravel>, not a lookalike', () => {
    render(
      <SkillGraphDebugger recorder={recorderFor()} cursorRuntimeStageId={AT_ENTRY} height={600} />,
    );
    // TimeTravel's OWN affordances, asserted by its own titles: a slider
    // re-implemented in this folder would have had to counterfeit them.
    expect(screen.getByTitle('Previous step (←)')).toBeTruthy();
    expect(screen.getByTitle('Next step (→)')).toBeTruthy();
    expect(screen.getByTitle('Jump to latest event (End)')).toBeTruthy();
  });

  it('scrubs the HOST\'s axis, with the host\'s numbers, when the host passes one', () => {
    const onStepChange = vi.fn();
    const onJumpTo = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_PICK}
        step={11}
        totalSteps={27}
        onStepChange={onStepChange}
        onJumpTo={onJumpTo}
        height={600}
      />,
    );
    // The readout is the HOST's axis (27 stops), not this view's 4 beats.
    expect(screen.getByText('12 / 27')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Next step (→)'));
    expect(onStepChange).toHaveBeenCalledWith(12);
    expect(onJumpTo).not.toHaveBeenCalled();
  });

  it('scrubs its own routing stops when it stands alone', () => {
    const onJumpTo = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        onJumpTo={onJumpTo}
        height={600}
      />,
    );
    expect(screen.getByText('1 / 4')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Next step (→)'));
    expect(onJumpTo).toHaveBeenCalledWith(AT_STAY);
  });

  it('takes the arrow keys when alone and defers them when hosted', () => {
    const alone = vi.fn();
    const { unmount } = render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        onJumpTo={alone}
        height={600}
      />,
    );
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(alone).toHaveBeenCalledWith(AT_STAY);
    unmount();

    // Hosted: the host's own transport already listens at the window, so this
    // one stays silent rather than moving the one cursor twice per press.
    const hostedJump = vi.fn();
    const hostedStep = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        step={1}
        totalSteps={27}
        onStepChange={hostedStep}
        onJumpTo={hostedJump}
        height={600}
      />,
    );
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(hostedStep).not.toHaveBeenCalled();
    expect(hostedJump).not.toHaveBeenCalled();
  });
});
