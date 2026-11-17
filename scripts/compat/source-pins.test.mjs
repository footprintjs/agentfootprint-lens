import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { authoredDevPins } from './contract.mjs';

const root = new URL('../../', import.meta.url);
const manifest = () => JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

test('the authored manifest passes the same exact-pin guard before dependency installation', () => {
  const input = manifest();
  const before = structuredClone(input);
  const pins = authoredDevPins(input);
  assert.deepEqual(pins, Object.fromEntries(Object.keys(pins).map((name) =>
    [name, input.devDependencies[name]])));
  assert.ok(Object.isFrozen(pins));
  assert.deepEqual(input, before);
  const output = execFileSync(process.execPath,
    [fileURLToPath(new URL('./check-source-pins.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.match(output, /lock and compatibility checks remain separate/);
});

for (const name of ['agentfootprint', 'footprintjs', 'foottrace']) {
  test(`${name}: a caret cannot become an authored development identity`, () => {
    const input = manifest();
    input.devDependencies[name] = `^${input.devDependencies[name]}`;
    assert.throws(() => authoredDevPins(input), { message: `${name}: exact dev pin required` });
  });
}

test('both proof workflows check authored pins before installs or native materialization', () => {
  let bootstraps = 0;
  for (const filename of ['ci.yml', 'context-producer.yml']) {
    const source = readFileSync(new URL(`.github/workflows/${filename}`, root), 'utf8');
    for (const job of source.split(/^  (?=[a-z][\w-]*:)/m)) {
      if (!job.includes('run: node scripts/compat/check-source-pins.mjs')) continue;
      bootstraps += 1;
      const guard = job.indexOf('run: node scripts/compat/check-source-pins.mjs');
      const install = job.search(/run: npm (?:ci|install)\b/);
      assert.ok(guard >= 0 && install > guard, `${filename}: authored pins before registry install`);
      const materialize = job.indexOf('node scripts/compat/source-inputs.mjs bootstrap');
      if (materialize >= 0) assert.ok(materialize > guard);
    }
  }
  assert.equal(bootstraps, 5, 'source Node22/24, independent CONTROL, packed matrix and producer job');
});
