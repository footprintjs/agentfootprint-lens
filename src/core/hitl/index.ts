/**
 * Typed HITL — the headless half.
 *
 * How the lens reads a paused run's typed question and builds the structured
 * answer: the era-robust component reader, the consent decision vocabulary
 * (mirrored by value from agentfootprint — never imported, peer-era law),
 * the wire-shaped decision body, and the display-only decision sentence.
 * Zero React — a Vue or CLI consumer builds its own pane over exactly these.
 */

export type {
  AskComponentView,
  ConsentDecisionView,
  DecisionRequestBody,
  PendingAskView,
} from './types.js';
export {
  approveDecision,
  declineDecision,
  decisionRequestBody,
  decisionSentence,
  isConsentAsk,
  isConsentDecision,
  readAwaitingComponent,
  type ConsentDecisionInput,
  type DecisionRequestInput,
} from './decision.js';
