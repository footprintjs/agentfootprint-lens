import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import { stepForRuntimeStageId } from '../group/stepForRuntimeStageId.js';
import { selectSkillBeatAt, selectSkillBeats, type SkillBeat } from './selectSkillBeats.js';
import { selectSkillFrameContext, type SelectSkillFrameContextArgs, type SkillFrameContext } from './selectSkillFrameContext.js';
import type { SkillRoute, SkillTurnStart } from './selectSkillRoute.js';
import { selectSkillTopology, type DeclaredEdgeInput, type SkillTopology } from './selectSkillTopology.js';

/** Recorded facts for one stop. Frame evidence is read only when requested. */
export interface SkillGraphReading {
  readonly beat: SkillBeat | undefined;
  readonly turnStart: SkillTurnStart | undefined;
  readonly topology: SkillTopology;
  frameContext(graph: SelectSkillFrameContextArgs['graph']): SkillFrameContext | undefined;
}

/**
 * Prepare once per immutable routing record. The caller supplies its cursor on
 * every read and remains responsible for moving it to a returned address.
 */
export function prepareSkillGraph(route: SkillRoute) {
  const beats = selectSkillBeats({ route });
  const visits = new Map<string, SkillBeat[]>();
  for (const beat of beats) {
    if (beat.cursorSkillId === undefined || beat.runtimeStageId === undefined) continue;
    const previous = visits.get(beat.cursorSkillId);
    if (previous) previous.push(beat);
    else visits.set(beat.cursorSkillId, [beat]);
  }
  const jumpableSkillIds: ReadonlySet<string> = new Set(visits.keys());
  const firstTurn = new Map<number, SkillTurnStart>();
  for (const turn of route.turns) {
    if (!firstTurn.has(turn.turnIndex)) firstTurn.set(turn.turnIndex, turn);
  }

  // Adjacent host positions can resolve to the same beat. Keep only that last
  // reading instead of retaining a complete topology for every replay stop.
  let lastReading: SkillGraphReading | undefined;
  let lastEdges: readonly DeclaredEdgeInput[] | undefined;
  return {
    beats,
    jumpableSkillIds,
    /** Next addressable visit after the current beat, wrapping at the end. */
    nextVisit(skillId: string, afterBeatIndex = -1): string | undefined {
      const spans = visits.get(skillId);
      return (spans?.find(b => b.index > afterBeatIndex) ?? spans?.[0])?.runtimeStageId;
    },
    /** Steps on the host's axis, in order, using the established navigation rules. */
    snapSteps(positions: readonly CursorPosition[]): readonly number[] | undefined {
      const remaining = new Set<string>();
      for (const beat of beats) {
        if (beat.runtimeStageId) remaining.add(beat.runtimeStageId);
      }
      const stops = new Set<number>();
      // An exact address lands on its first position. Match all exact addresses
      // in one pass; the canonical resolver handles enclosing and earlier stops.
      for (let i = 0; i < positions.length && remaining.size > 0; i++) {
        if (remaining.delete(positions[i]!.runtimeStageId)) stops.add(i);
      }
      for (const id of remaining) {
        const step = stepForRuntimeStageId(positions, id);
        if (step >= 0) stops.add(step);
      }
      return stops.size ? [...stops].sort((a, b) => a - b) : undefined;
    },
    at(runtimeStageId: string, cursorKind?: string, declaredEdges?: readonly DeclaredEdgeInput[]): SkillGraphReading {
      const beat = selectSkillBeatAt(beats, runtimeStageId, cursorKind);
      const sameBeat = lastReading?.beat === beat ? lastReading : undefined;
      if (sameBeat && lastEdges === declaredEdges) return sameBeat;
      const reading: SkillGraphReading = {
        beat,
        turnStart: beat === undefined ? undefined : firstTurn.get(beat.turnIndex),
        topology: selectSkillTopology({ route, beat, declaredEdges }),
        // A changed drawing can redraw edges without rereading the model call.
        frameContext: sameBeat?.frameContext ?? (graph => {
          if (beat === undefined) return undefined;
          return selectSkillFrameContext({ graph, beat, nextBeat: beats[beat.index + 1] });
        }),
      };
      lastReading = reading;
      lastEdges = declaredEdges;
      return reading;
    },
  };
}
