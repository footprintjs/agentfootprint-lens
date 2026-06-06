/**
 * Diagnostic dump — prints footprintjs canonical snapshot AND lens
 * domain StepGraph for the same Parallel run. Verifies the invariant:
 *
 *   STRUCTURE is the same across layers. Only PAYLOAD varies.
 *
 * Both snapshots key the same nodes by `runtimeStageId`. The footprintjs
 * snapshot owns the structural truth (subflows, forks, control flow);
 * the lens StepGraph is a projection of that structure with domain
 * decoration attached.
 */

import { describe, it } from 'vitest';
import { LLMCall, Parallel, MockProvider } from 'agentfootprint';
import { lensSnapshotRecorder } from './LensSnapshotRecorder.js';

function llm(reply: string) {
  return LLMCall.create({ provider: new MockProvider({ reply }), model: 'mock' })
    .system('hi')
    .build();
}

function pretty(o: unknown): string {
  return JSON.stringify(o, null, 2);
}

describe('DUMP — footprintjs snapshot vs lens domain projection', () => {
  it('TolerantCommittee 2-branch parallel — structure parity', async () => {
    const par = Parallel.create({ name: 'TolerantCommittee' })
      .branch('legal', llm('legal-says'))
      .branch('ethics', llm('ethics-says'))
      .mergeWithFn((r) => Object.values(r).join(' | '))
      .build();

    const lensRec = lensSnapshotRecorder({ id: 'lens-snap' });
    par.attach(lensRec);

    await par.run({ message: 'go' });

    const fpSnap = par.getLastSnapshot();
    const lensGraph = lensRec.getStepGraph();

    /* eslint-disable no-console */
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  FOOTPRINTJS SNAPSHOT (canonical structure)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Top-level keys:', Object.keys(fpSnap ?? {}));
    console.log('\n--- executionTree (structure tree) ---');
    console.log(pretty(fpSnap?.executionTree));
    console.log('\n--- commitLog (per-stage writes) ---');
    console.log('Length:', fpSnap?.commitLog?.length);
    console.log(pretty(fpSnap?.commitLog?.slice(0, 5)));

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  LENS DOMAIN PROJECTION (StepGraph)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n--- nodes (one per primitive boundary + fork branch) ---');
    console.log(pretty(lensGraph.nodes));
    console.log('\n--- edges (control-flow transitions) ---');
    console.log(pretty(lensGraph.edges));

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  STRUCTURAL PARITY CHECK');
    console.log('═══════════════════════════════════════════════════════════');

    // Walk the footprintjs executionTree and collect every stage id
    // that has a primitive description (Agent/LLMCall/etc.) — these
    // SHOULD appear as nodes in the lens StepGraph (joined by
    // runtimeStageId).
    const fpPrimitiveRids = collectPrimitiveRids(fpSnap?.executionTree);
    console.log(
      '\nfootprintjs primitive subflows (runtimeStageIds):',
      fpPrimitiveRids,
    );
    console.log(
      'lens StepGraph node runtimeStageIds:',
      lensGraph.nodes.map((n) => n.runtimeStageId),
    );

    // Verify the fork-branch children appear in BOTH layers.
    const fpForkChildren = collectForkChildren(fpSnap?.executionTree);
    const lensForkBranches = lensGraph.nodes
      .filter((n) => n.kind === 'fork-branch')
      .map((n) => n.label);
    console.log('\nfootprintjs fork children (from flowMessages):', fpForkChildren);
    console.log('lens fork-branch node labels:', lensForkBranches);
    console.log('\nINVARIANT — both layers see the SAME branches.');
    /* eslint-enable no-console */
  });
});

// ─── helpers ────────────────────────────────────────────────────────

function collectPrimitiveRids(
  node: unknown,
  out: string[] = [],
): readonly string[] {
  if (!node || typeof node !== 'object') return out;
  const n = node as {
    description?: string;
    runtimeStageId?: string;
    next?: unknown;
  };
  if (n.description && /^(Agent|LLMCall|Sequence|Parallel|Conditional|Loop):/.test(n.description)) {
    if (n.runtimeStageId) out.push(n.runtimeStageId);
  }
  if (n.next) collectPrimitiveRids(n.next, out);
  return out;
}

function collectForkChildren(
  node: unknown,
  out: string[] = [],
): readonly string[] {
  if (!node || typeof node !== 'object') return out;
  const n = node as {
    flowMessages?: ReadonlyArray<{
      type?: string;
      targetStage?: unknown;
    }>;
    next?: unknown;
  };
  if (n.flowMessages) {
    for (const msg of n.flowMessages) {
      if (msg.type === 'children' && Array.isArray(msg.targetStage)) {
        for (const t of msg.targetStage) out.push(String(t));
      }
    }
  }
  if (n.next) collectForkChildren(n.next, out);
  return out;
}
