import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installBrowser } from './browser-install.mjs';

function fixture(t) {
  assert.equal(typeof installBrowser, 'function');
  const root = mkdtempSync(join(tmpdir(), 'lens-browser-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const consumer = join(root, 'consumer');
  const evidence = join(root, 'evidence');
  mkdirSync(consumer);
  mkdirSync(evidence);
  return { consumer, evidence };
}

function wrappedTimeout(label) {
  const actual = Object.assign(new Error(label), { code: 'ETIMEDOUT' });
  return new assert.AssertionError({ actual, expected: undefined,
    operator: 'strictEqual', message: 'synthetic command spawn failure' });
}

function scriptedRun(outcomes) {
  const calls = [];
  function run(command, args, options) {
    calls.push({ command, args: [...args], options: { ...options } });
    if (calls.length > outcomes.length) {
      throw Object.assign(new Error('fake run call budget exceeded'), { code: 'ERR_TEST_CALL_LIMIT' });
    }
    const outcome = outcomes[calls.length - 1];
    writeFileSync(options.log, outcome.log);
    if (outcome.error) throw outcome.error;
    return outcome.output ?? 'installed';
  }
  return { calls, run };
}

function expectedCall({ consumer, evidence }, retry = false) {
  return { command: process.execPath,
    args: [join(consumer, 'node_modules/playwright/cli.js'), 'install', '--with-deps', 'chromium'],
    options: { cwd: consumer, timeout: 300_000,
      log: join(evidence, retry ? 'browser-install-retry.log' : 'browser-install.log') } };
}

test('first success installs Chromium exactly once with the original command, limit and log', (t) => {
  const input = fixture(t);
  const fake = scriptedRun([{ log: 'first success evidence' }]);
  installBrowser(input, fake.run);
  assert.deepEqual(fake.calls, [expectedCall(input)]);
  assert.equal(readFileSync(join(input.evidence, 'browser-install.log'), 'utf8'), 'first success evidence');
  assert.equal(existsSync(join(input.evidence, 'browser-install-retry.log')), false);
});

test('a wrapped command timeout retries once and preserves both distinct logs', (t) => {
  const input = fixture(t);
  const first = wrappedTimeout('first timeout');
  const fake = scriptedRun([{ error: first, log: 'first timeout evidence' }, { log: 'retry success evidence' }]);
  installBrowser(input, fake.run);
  assert.deepEqual(fake.calls, [expectedCall(input), expectedCall(input, true)]);
  assert.equal(readFileSync(join(input.evidence, 'browser-install.log'), 'utf8'), 'first timeout evidence');
  assert.equal(readFileSync(join(input.evidence, 'browser-install-retry.log'), 'utf8'), 'retry success evidence');
});

test('two timeouts throw the second identical error after exactly two attempts', (t) => {
  const input = fixture(t);
  const first = wrappedTimeout('first timeout');
  const second = wrappedTimeout('second timeout');
  const fake = scriptedRun([{ error: first, log: 'first timeout evidence' },
    { error: second, log: 'second timeout evidence' }]);
  assert.throws(() => installBrowser(input, fake.run), (error) => error === second);
  assert.deepEqual(fake.calls, [expectedCall(input), expectedCall(input, true)]);
  assert.equal(readFileSync(join(input.evidence, 'browser-install.log'), 'utf8'), 'first timeout evidence');
  assert.equal(readFileSync(join(input.evidence, 'browser-install-retry.log'), 'utf8'), 'second timeout evidence');
});

test('a permanent failure after the timeout propagates the second error without another retry', (t) => {
  const input = fixture(t);
  const first = wrappedTimeout('first timeout');
  const second = new assert.AssertionError({ actual: 17, expected: 0,
    operator: 'strictEqual', message: 'synthetic retry command exited nonzero' });
  const fake = scriptedRun([{ error: first, log: 'first timeout evidence' },
    { error: second, log: 'permanent retry failure evidence' }]);
  assert.throws(() => installBrowser(input, fake.run), (error) => error === second);
  assert.deepEqual(fake.calls, [expectedCall(input), expectedCall(input, true)]);
  assert.equal(readFileSync(join(input.evidence, 'browser-install.log'), 'utf8'), 'first timeout evidence');
  assert.equal(readFileSync(join(input.evidence, 'browser-install-retry.log'), 'utf8'), 'permanent retry failure evidence');
});

const noRetry = [
  ['an initial nonzero command status', () => new assert.AssertionError({ actual: 17, expected: 0,
    operator: 'strictEqual', message: 'synthetic command exited nonzero' })],
  ['an initial ENOENT spawn assertion', () => new assert.AssertionError({
    actual: Object.assign(new Error('synthetic executable missing'), { code: 'ENOENT' }),
    expected: undefined, operator: 'strictEqual', message: 'synthetic spawn failure' })],
  ['a bare timeout Error without the command assertion wrapper', () =>
    Object.assign(new Error('synthetic bare timeout'), { code: 'ETIMEDOUT',
      actual: Object.assign(new Error('synthetic timeout payload'), { code: 'ETIMEDOUT' }) })],
];
for (const [label, makeError] of noRetry) test(`${label} propagates without a retry`, (t) => {
  const input = fixture(t);
  const error = makeError();
  const fake = scriptedRun([{ error, log: 'initial terminal failure evidence' }]);
  assert.throws(() => installBrowser(input, fake.run), (actual) => actual === error);
  assert.deepEqual(fake.calls, [expectedCall(input)]);
  assert.equal(readFileSync(join(input.evidence, 'browser-install.log'), 'utf8'), 'initial terminal failure evidence');
  assert.equal(existsSync(join(input.evidence, 'browser-install-retry.log')), false);
});
