// Why follows this checkout's release metadata. Only the external Flow
// candidate is frozen; a normal Why version bump must not stale the matrix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags } from './contract.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const numeric = '(?:0|[1-9][0-9]*)';
const prerelease = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const versionPattern = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

export function readWhyIdentity(root = sourceRoot) {
  const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(name, 'agentfootprint-lens', 'compatibility source must be the Why Lens package');
  assert.equal(typeof version, 'string', 'Why version must be a string');
  assert.match(version, versionPattern, 'Why version must be a safe, exact semantic version');
  return Object.freeze({ name, version, filename: `${name}-${version}.tgz` });
}

export function assertWhyIdentity(contract, root = sourceRoot) {
  const identity = readWhyIdentity(root);
  assert.equal(contract.schema, 1);
  assert.deepEqual(contract.whyIdentity, identity, 'artifact identity must match this checked Why source');
  assert.equal(contract.why.name, identity.name, 'Why archive name differs from its source');
  assert.equal(contract.why.version, identity.version, 'Why archive version differs from its source');
  assert.equal(contract.why.path, identity.filename, 'Why archive path must be the exact source-derived basename');
  return identity;
}

export function whyArchivePath(artifacts, root = sourceRoot) {
  const contract = JSON.parse(readFileSync(join(artifacts, 'contract.json'), 'utf8'));
  const identity = assertWhyIdentity(contract, root);
  return resolve(artifacts, identity.filename);
}

// CI uses the same validation before selecting an archive for npm install.
// No shell glob, mutable version lookup, or contract-supplied arbitrary path.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), ['artifacts']);
  console.log(flags.artifacts ? whyArchivePath(flags.artifacts) : readWhyIdentity().filename);
}
