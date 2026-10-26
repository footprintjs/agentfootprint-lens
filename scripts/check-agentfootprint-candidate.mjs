// Strictly install actual archives, then reuse the existing packed runtime/type
// probes. This is independent of the Flow bridge's older compatibility lanes.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInstalled, parseFlags, tooling } from './compat/contract.mjs';
import { command, inspectArchive, writeJson } from './compat/process.mjs';
import { readWhyIdentity } from './compat/why-identity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = parseFlags(process.argv.slice(2), ['agent-tar', 'lens-tar', 'evidence']);
assert.ok(flags['agent-tar'] && flags['lens-tar'] && flags.evidence,
  '--agent-tar, --lens-tar and a fresh --evidence directory are required');
const evidence = resolve(flags.evidence);
mkdirSync(evidence); // Never overwrite evidence from an earlier failed attempt.
const agent = inspectArchive(flags['agent-tar'], evidence, { name: 'agentfootprint', version: '11.0.0' });
const lens = inspectArchive(flags['lens-tar'], evidence, readWhyIdentity());
const consumer = join(evidence, 'consumer');
mkdirSync(consumer);
writeJson(join(evidence, 'archives.json'), { agent: { sha256: agent.sha256, files: agent.files },
  lens: { sha256: lens.sha256, files: lens.files } });
writeJson(join(consumer, 'package.json'), {
  name: 'lens-agentfootprint-11-consumer', version: '1.0.0', private: true,
  dependencies: {
    'agentfootprint-lens': `file:${lens.path}`, agentfootprint: `file:${agent.path}`,
    footprintjs: '10.0.0', foottrace: '1.7.0', 'footprint-explainable-ui': '0.38.0',
    '@xyflow/react': '12.10.2', react: '18.3.1', 'react-dom': '18.3.1',
    typescript: tooling.typescript, '@types/node': tooling['@types/node'],
    '@types/react': '18.3.3', '@types/react-dom': '18.3.0',
  },
});
command('npm', ['install', '--strict-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: consumer, log: join(evidence, 'install.log') });
command('npm', ['ls', '--all', '--json'], { cwd: consumer, log: join(evidence, 'tree.json') });
function verifyBytes() {
  assertInstalled(join(consumer, 'node_modules/agentfootprint'), agent.files, 'AgentFootprint');
  assertInstalled(join(consumer, 'node_modules/agentfootprint-lens'), lens.files, 'Lens');
}
verifyBytes();
copyFileSync(join(root, 'scripts/check-packed-peers.mjs'), join(consumer, 'check-packed-peers.mjs'));
command(process.execPath, ['check-packed-peers.mjs'], { cwd: consumer, log: join(evidence, 'runtime.log') });
for (const [extension, module, resolution] of [
  ['mts', 'NodeNext', 'NodeNext'], ['cts', 'NodeNext', 'NodeNext'], ['ts', 'ESNext', 'Bundler'],
]) {
  const filename = `check-packed-peer-types.${extension}`;
  copyFileSync(join(root, 'scripts/check-packed-peer-types.ts'), join(consumer, filename));
  command(process.execPath, [join(consumer, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
    '--skipLibCheck', 'false', '--target', 'ES2022', '--types', 'react', '--lib', 'ES2022,DOM,DOM.Iterable',
    '--module', module, '--moduleResolution', resolution, filename],
  { cwd: consumer, log: join(evidence, `types-${extension}.log`) });
}
verifyBytes();
writeJson(join(evidence, 'result.json'), { status: 'passed', agent: agent.version, lens: lens.version,
  node: process.version, agentSha256: agent.sha256, lensSha256: lens.sha256 });
console.log('Strict AgentFootprint 11 / Lens archive install, runtime and all declaration modes passed.');
