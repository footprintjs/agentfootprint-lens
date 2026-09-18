/**
 * `agentfootprint-lens/context` — the Context view door.
 *
 * One import line that names the view you are mounting:
 *
 *   import { ContextView } from 'agentfootprint-lens/context';
 *
 *   <ContextView runner={recording} />                       // its own cursor
 *   <ContextView runner={recording} cursor={p.cursor} />     // the Lens's ONE cursor
 *
 * WHY A DOOR (0.53.1): a page that mounts only this view must carry only this
 * view. The docs walkthrough that mounted it from the root barrel shared that
 * barrel with the site's Lens demo, and the bundler hoisted the whole barrel
 * into a chunk both pages download — the deferred-demo budget rose by 26 KB
 * gzip for a component the demo never renders. A separate entry keeps the
 * bytes with the page that uses them; the shared cores (served, cursor,
 * tags) stay shared, as they should. Same reason `/why` and `/skillgraph`
 * exist. Everything here is ALSO on the root barrel — a door is an addition,
 * never a move.
 *
 * Beside the mount component: its HEADLESS core, `contextAt` — the join over
 * the three records (commit log ⟂ events by `runtimeStageId`, commit log ⟂
 * receipt by epoch), for hosts with their own UI — and the milestone-tag axis
 * the standalone view walks. See src/core/context/README.md.
 */
export {
  ContextView,
  LABELS as CONTEXT_LABELS,
  MILESTONE_AXIS as CONTEXT_MILESTONE_AXIS,
  type ContextViewProps,
} from '../react/components/ContextView.js';
// 0.62.0: the Reasoning lens, beside the Context view — the same fold read
// BY CALL. An addition to the door, never a move; also on the root barrel.
export {
  ReasoningLens,
  LABELS as REASONING_LABELS,
  foldReasoning,
  type ReasoningLensProps,
  type ReasoningFold,
  type ReasoningCard,
  type ReasoningInput,
  type AnswerCard as ReasoningAnswerCard,
  // 0.63.0: the exchange view's pure fold and its beat shapes.
  foldExchange,
  type ReasoningView,
  type ExchangeFold,
  type ExchangeBeat,
  type CallBeat as ReasoningCallBeat,
  type ResultBeat as ReasoningResultBeat,
  type ServedBeat as ReasoningServedBeat,
  type AnswerBeat as ReasoningAnswerBeat,
  type CollapsedShape as ReasoningCollapsedShape,
  type EmittedCallShape as ReasoningEmittedCallShape,
} from '../react/components/ReasoningLens.js';
// 0.64.0: the Ontology view — the map the application declared, drawn from
// the run constant `ontology` (agentfootprint 9.106.0). An addition to the
// door, never a move; also on the root barrel.
export {
  OntologyView,
  LABELS as ONTOLOGY_LABELS,
  foldOntology,
  layoutOntology,
  ontologyRecordOf,
  GEOMETRY as ONTOLOGY_GEOMETRY,
  type OntologyViewProps,
  type OntologyFold,
  type OntologyLayout,
  type OntologyRecordShape,
  type TermShape as OntologyTermShape,
  type SourceShape as OntologySourceShape,
  type HeldShape as OntologyHeldShape,
  type RelationShape as OntologyRelationShape,
} from '../react/components/OntologyView.js';
// 0.65.0: the Coverage band — what the tools declared they checked, did not
// check and can never cover (agentfootprint 9.109, `coverageDeclared`), the
// merged boundary and every declaration by call. `<ReasoningLens>` mounts it
// under the cards. An addition to the door, never a move; also on the root
// barrel.
export {
  CoverageBand,
  LABELS as COVERAGE_LABELS,
  foldCoverage,
  coverageRecordOf,
  type CoverageBandProps,
  type CoverageFold,
  type CoverageBoundary,
  type CoverageSection,
  type BoundaryItem as CoverageBoundaryItem,
  type CoverageItemShape,
  type DeclaredCoverageShape,
} from '../react/components/CoverageBand.js';
// 0.66.0: the Proof map — what the answer rests on, as one graph drawn from
// the record (agentfootprint 9.110.0: the ledger with its `contingent` rows,
// `unsupportedValues`, the declared map's `via` join). An addition to the
// door, never a move; also on the root barrel.
export {
  ProofMap,
  LABELS as PROOF_MAP_LABELS,
  foldProofMap,
  layoutProofMap,
  GEOMETRY as PROOF_MAP_GEOMETRY,
  type ProofMapProps,
  type ProofMapInput,
  type ProofFold,
  type ProofLayout,
  type ProofCall,
  type ProofAnswer,
  type ProofSource,
  type ProofNodeKind,
  type ProofEdgeKind,
  type PlacedNode as ProofPlacedNode,
  type PlacedEdge as ProofPlacedEdge,
  type ContingentShape as ProofContingentShape,
  type CarrierShape as ProofCarrierShape,
} from '../react/components/ProofMap.js';
// 0.67.0: the story's marks — the story's beats (the AgentThinkingUI
// player's trace, agentfootprint 9.111.0's `toolCallId` on ask and return)
// joined to the ledger at ONE stop, as the chips a host hands the player's
// `marks` prop. A pure fold; the player stays generic. An addition to the
// door, never a move; also on the root barrel.
export {
  storyMarks,
  LABELS as STORY_MARK_LABELS,
  CLIP as STORY_MARK_CLIP,
  type StoryMark,
  type StoryMarks,
  type StoryTone,
  type StoryRecord,
  type StoryTraceShape,
  type StoryBeatShape,
  type StoryKeyShape,
} from '../react/components/storyMarks.js';
export {
  contextAt,
  type ContextAt,
  type ContextAtOptions,
  type ContextKey,
  type ContextServed,
} from '../core/context/contextAt.js';
