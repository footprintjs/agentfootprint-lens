// Independent published CONTROL; never an input to the target-major result.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectCommentaryKey } from 'agentfootprint';
import { assertSingleFoottrace } from './contract.mjs';
import { commentaryControl } from './source-inputs/materialize.mjs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const declared = lock.packages[''];
for (const name of Object.keys({ ...declared.dependencies, ...declared.devDependencies })) {
  const version = commentaryControl[name] ?? lock.packages[`node_modules/${name}`].version;
  const actual = JSON.parse(readFileSync(resolve('node_modules', name, 'package.json'), 'utf8'));
  assert.equal(actual.version, version, name);
  console.log(`CONTROL ${name}@${actual.version}`);
}
assertSingleFoottrace(resolve('node_modules'), commentaryControl.foottrace);
for (const [type, key] of [
  ['agentfootprint.cost.tick', null],
  ['agentfootprint.agent.run_configured', 'event.agentfootprint.agent.run_configured'],
  ['agentfootprint.integrity.disposition', 'event.agentfootprint.integrity.disposition'],
]) assert.equal(selectCommentaryKey({ type, payload: {} }), key, type);
