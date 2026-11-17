// Explicit source input entry. Ordinary registry proof keeps its own policy.
export { validateProvider, validateInputKind } from './source-inputs/admission.mjs';
export { projectManifest } from './source-inputs/projection.mjs';
export { scanInstalledPackages, verifyNativeLock, verifyNativeInstalled } from './source-inputs/installed.mjs';
export { inspectInputs } from './source-inputs/archives.mjs';
export { bootstrap, verifyBootstrap, restoreManifest, assertSourceClone } from './source-inputs/materialize.mjs';
export { verifyRestored } from './source-inputs/gates.mjs';

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseFlags } from './contract.mjs';
import { fetchInputs } from './source-inputs/transport.mjs';
import { bootstrap, verifyBootstrap, restoreManifest } from './source-inputs/materialize.mjs';
import { runGates, packTarget, verifyRestored } from './source-inputs/gates.mjs';

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...args] = process.argv.slice(2);
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'effectful source proof is hosted-only');
  assert.equal(process.env.GITHUB_REPOSITORY, 'footprintjs/agentfootprint-lens');
  let result;
  if (action === 'fetch') {
    const f = parseFlags(args, ['out']); assert.ok(f.out); result = fetchInputs(f.out);
  } else if (action === 'bootstrap') {
    const f = parseFlags(args, ['source', 'target', 'evidence', 'inputs', 'mode']);
    assert.ok(f.source && f.target && f.evidence && f.mode); result = bootstrap(f);
  } else if (action === 'pack') {
    const f = parseFlags(args, ['evidence', 'out', 'existing']); assert.ok(f.evidence && f.out);
    result = packTarget(f.evidence, f.out, f.existing);
  } else {
    const f = parseFlags(args, ['evidence']); assert.ok(f.evidence);
    assert.ok(['verify', 'restore', 'verify-restored', 'gates'].includes(action));
    result = action === 'verify' ? verifyBootstrap(f.evidence)
      : action === 'restore' ? restoreManifest(f.evidence)
      : action === 'verify-restored' ? verifyRestored(f.evidence) : runGates(f.evidence);
  }
  console.log(JSON.stringify(result));
}
