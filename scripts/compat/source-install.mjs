// Resolve the offline candidate once, then replay that generated lock in the
// separate, fresh source checkout. No CI-local path enters the public manifest.
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertInstalled, assertSingleFoottrace, nativeCandidate, parseFlags, sha256 } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';
import { assertNativeSourceMetadata } from './stage-proof.mjs';

const flags = parseFlags(process.argv.slice(2), ['agent-tar', 'agent-source', 'evidence']);
assert.ok(flags['agent-tar'] && flags['agent-source'] && flags.evidence,
  'usage: --agent-tar <archive> --agent-source <metadata> --evidence <fresh directory>');
const source = process.cwd();
assert.equal(existsSync(join(source, 'node_modules')), false, 'source checkout must have no installed tree');
assert.equal(existsSync(join(source, 'package-lock.json')), false, 'source checkout must have no generated lock');
const evidence = resolve(flags.evidence);
mkdirSync(evidence);
const agent = inspectArchive(flags['agent-tar'], evidence,
  { name: 'agentfootprint', version: nativeCandidate.version });
const nativeSource = assertNativeSourceMetadata(JSON.parse(readFileSync(flags['agent-source'], 'utf8')), agent.sha256);
const manifestFile = join(source, 'package.json');
const original = readFileSync(manifestFile);
const manifest = JSON.parse(original);
assert.equal(manifest.devDependencies.agentfootprint, nativeCandidate.version);
assert.equal(manifest.devDependencies.footprintjs, nativeCandidate.engines.footprintjs);
assert.equal(manifest.devDependencies.foottrace, nativeCandidate.engines.foottrace);
manifest.devDependencies.agentfootprint = `file:${agent.path}`;
const resolution = join(evidence, 'resolve');
mkdirSync(resolution);
writeJson(join(resolution, 'package.json'), manifest);
command('npm', ['install', '--strict-peer-deps', '--no-audit', '--no-fund'],
  { cwd: resolution, log: join(evidence, 'resolve.log') });
copyFileSync(join(resolution, 'package-lock.json'), join(source, 'package-lock.json'));
copyFileSync(join(resolution, 'package-lock.json'), join(evidence, 'package-lock.json'));
const lockSha256 = sha256(readFileSync(join(evidence, 'package-lock.json')));
try {
  copyFileSync(join(resolution, 'package.json'), manifestFile);
  command('npm', ['ci', '--strict-peer-deps', '--no-audit', '--no-fund'],
    { cwd: source, log: join(evidence, 'ci.log') });
} finally {
  writeFileSync(manifestFile, original);
}
assert.equal(sha256(readFileSync(join(source, 'package-lock.json'))), lockSha256,
  'fresh-copy npm ci must preserve the exact generated lock');
assertInstalled(join(source, 'node_modules/agentfootprint'), agent.files, 'source AgentFootprint');
assert.equal(JSON.parse(readFileSync(join(source, 'node_modules/footprintjs/package.json'), 'utf8')).version,
  nativeCandidate.engines.footprintjs);
command('npm', ['ls', '--all', '--json'], { log: join(evidence, 'tree.json') });
command('npm', ['ls', 'foottrace'], { log: join(evidence, 'foottrace.log') });
writeJson(join(evidence, 'verification.json'), {
  schema: 1, policy: 'generated-lock replay', node: process.version,
  npm: command('npm', ['--version']).trim(), nativeSource,
  lockSha256, agentSha256: agent.sha256,
  recordOwner: assertSingleFoottrace(join(source, 'node_modules'), nativeCandidate.engines.foottrace),
});
