// Only the reviewed renderer original and the independent published control use this entry.
export { inspectRendererInputs } from './source-inputs/archives.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseFlags } from './contract.mjs';
import { fetchRendererInputs } from './source-inputs/transport.mjs';
import { bootstrap } from './source-inputs/materialize.mjs';
import { runGates } from './source-inputs/gates.mjs';

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...args] = process.argv.slice(2);
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'effectful source proof is hosted-only');
  assert.equal(process.env.GITHUB_REPOSITORY, 'footprintjs/agentfootprint-lens');
  let result;
  if (action === 'fetch-renderer') {
    const f = parseFlags(args, ['out']); assert.ok(f.out); result = fetchRendererInputs(f.out);
  } else if (action === 'bootstrap') {
    const f = parseFlags(args, ['source', 'target', 'evidence', 'mode']);
    assert.ok(f.source && f.target && f.evidence && f.mode); result = bootstrap(f);
  } else {
    assert.equal(action, 'gates', 'unknown source input action');
    const f = parseFlags(args, ['evidence']); assert.ok(f.evidence);
    result = runGates(f.evidence);
  }
  console.log(JSON.stringify(result));
}
