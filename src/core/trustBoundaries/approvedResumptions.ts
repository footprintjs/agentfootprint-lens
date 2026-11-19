import type { TrustBoundaryFact } from './types.js';

/** Match a recheck to the recorded human answer for this exact call in this capture. */
export function approvedResumptions(facts: readonly TrustBoundaryFact[]): ReadonlySet<number> {
  const approvals = new Set<string>();
  const matched = new Set<number>();
  let previous = 0;
  for (const fact of facts) {
    // A missing observation could contain a new question or decision.
    if (fact.seq !== previous + 1) approvals.clear();
    previous = fact.seq;
    if (fact.eventType !== 'agentfootprint.middleware.decision' && fact.eventType !== 'agentfootprint.permission.check') continue;
    if (fact.toolCallId === undefined || fact.iteration === undefined) continue;
    const key = JSON.stringify([fact.runId, fact.iteration, fact.toolCallId]);
    if (fact.phase === 'resume' && approvals.has(key)) matched.add(fact.seq);
    if (fact.eventType === 'agentfootprint.middleware.decision' && fact.moment === 'before-tool') {
      if (fact.personApproved === true) approvals.add(key);
      else if (fact.personApproved === false || (fact.outcome === 'ask' && fact.phase !== 'resume')) approvals.delete(key);
    }
  }
  return matched;
}
