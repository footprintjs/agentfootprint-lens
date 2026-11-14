import { flowChart } from 'footprintjs';
import { admitContext } from './admit/index.js';
import { routeContext } from './route/index.js';
import { acceptContext, refuseContext } from './finish/index.js';
import type { ContextOpening, OpeningCell, OpeningState } from './types.js';
/** Wiring only; a per-run result cell keeps raw values out of recorded scope. */
export async function openContextRecording(input: unknown): Promise<ContextOpening> {
  const result: OpeningCell = {};
  const chart = flowChart<OpeningState>('Read recorded context', admitContext(input, result), 'admit-context')
    .addDeciderFunction('Can open recording?', routeContext, 'context-disposition')
    .addFunctionBranch('accept', 'Open recording', acceptContext)
    .addFunctionBranch('refuse', 'Refuse recording', refuseContext)
    .end()
    .build();
  const trace = await chart.run({});
  return { verdict: result.verdict!, trace };
}
