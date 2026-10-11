import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashFiles, safeArchiveNames, sha256 } from './contract.mjs';

export function command(command, args, { cwd, log, env = {}, timeout = 300_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd, env: { ...process.env, ...env }, encoding: 'utf8',
    timeout, maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (log) writeFileSync(log, output);
  assert.equal(result.error, undefined, `${command} failed: ${result.error?.message}; log: ${log}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed (${result.status}); log: ${log}\n${output.slice(-6000)}`);
  return result.stdout;
}

export function inspectArchive(filename, parent, { name, version, expectedSha } = {}) {
  const absolute = resolve(filename);
  const digest = sha256(readFileSync(absolute));
  if (expectedSha) assert.equal(digest, expectedSha, `${name}: tarball digest mismatch`);
  safeArchiveNames(command('tar', ['-tzf', absolute]));
  // Reject link/device members BEFORE extraction (not just after extraction).
  const listing = command('tar', ['-tvzf', absolute]);
  for (const line of listing.trim().split('\n')) {
    assert.ok(line.startsWith('-') || line.startsWith('d'), `non-data archive member: ${line}`);
  }
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'unpacked-'));
  command('tar', ['-xzf', absolute, '-C', directory]);
  const packageDir = join(directory, 'package');
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  assert.equal(manifest.name, name);
  if (version) assert.equal(manifest.version, version);
  return { path: absolute, name: manifest.name, version: manifest.version, sha256: digest,
    files: hashFiles(packageDir), manifest };
}

export function writeJson(filename, value) {
  writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
}
