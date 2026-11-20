import { join } from 'node:path';
import { command, writeJson } from '../process.mjs';
import { readJson } from './archives.mjs';
import { verifyBootstrap } from './materialize.mjs';

export function runGates(evidence) {
  const data = readJson(join(evidence, 'bootstrap.json'));
  const gates = [['commentary', null], ['build', ['run', 'build']], ['unit', ['test']]];
  const completed = [];
  for (const [name, args] of gates) {
    verifyBootstrap(evidence);
    command(args ? 'npm' : process.execPath, args ?? ['scripts/compat/commentary-control.mjs'],
      { cwd: data.target, log: join(evidence, `${name}.log`), timeout: 1_200_000 });
    verifyBootstrap(evidence);
    completed.push(name); writeJson(join(evidence, 'gates.json'), { mode: data.mode, completed });
  }
  return { mode: data.mode, completed };
}
