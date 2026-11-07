import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installBrowser } from './browser-install.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lens-install-phases-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const consumer = join(root, 'consumer');
  const evidence = join(root, 'evidence');
  mkdirSync(consumer); mkdirSync(evidence);
  return { consumer, evidence };
}

test('system dependencies complete once before a browser download that cannot invoke apt', async (t) => {
  const input = fixture(t); const calls = [];
  const run = (phase) => (command, args, options) => {
    calls.push({ phase, command, args, options });
    writeFileSync(options.log, phase);
    return phase;
  };
  await installBrowser(input, run('browser'), run('dependencies'));
  assert.deepEqual(calls.map(({ phase }) => phase), ['dependencies', 'browser']);
  assert.deepEqual(calls[0].args.slice(1), ['install-deps', 'chromium']);
  assert.deepEqual(calls[1].args.slice(1), ['install', 'chromium']);
  assert.equal(calls[0].options.timeout, 300_000);
  assert.equal(calls[1].options.timeout, 300_000);
  assert.equal(calls[0].options.log, join(input.evidence, 'browser-dependencies.log'));
  assert.equal(calls[1].options.log, join(input.evidence, 'browser-install.log'));
});

test('a dependency timeout is terminal and never starts a browser attempt or a second apt install', async (t) => {
  const input = fixture(t); let dependencies = 0; let browsers = 0;
  const failure = new assert.AssertionError({
    actual: Object.assign(new Error('inert dependency timeout'), { code: 'ETIMEDOUT' }),
    expected: undefined, operator: 'strictEqual', message: 'inert dependency failure',
  });
  await assert.rejects(async () => installBrowser(input, () => { browsers += 1; }, () => {
    dependencies += 1; throw failure;
  }), (error) => error === failure);
  assert.equal(dependencies, 1); assert.equal(browsers, 0);
});

test('browser download stays pending until an asynchronous dependency phase completes', async (t) => {
  const input = fixture(t); let release; let browsers = 0;
  const dependencies = new Promise((resolve) => { release = resolve; });
  const result = installBrowser(input, () => { browsers += 1; return 'installed'; }, () => dependencies);
  await Promise.resolve();
  assert.equal(browsers, 0);
  release();
  assert.equal(await result, 'installed');
  assert.equal(browsers, 1);
});

test('a successful retry waits for the first download to reject after cleanup', async (t) => {
  const input = fixture(t); const order = []; let attempts = 0;
  const failure = new assert.AssertionError({
    actual: Object.assign(new Error('inert download timeout'), { code: 'ETIMEDOUT' }),
    expected: undefined, operator: 'strictEqual', message: 'inert download failure',
  });
  const download = async () => {
    attempts += 1;
    if (attempts === 1) {
      order.push('first started');
      await Promise.resolve();
      order.push('first cleanup finished');
      throw failure;
    }
    order.push('retry started');
    return 'installed';
  };
  assert.equal(await installBrowser(input, download, () => order.push('dependencies finished')), 'installed');
  assert.deepEqual(order, ['dependencies finished', 'first started', 'first cleanup finished', 'retry started']);
  assert.equal(attempts, 2);
});
