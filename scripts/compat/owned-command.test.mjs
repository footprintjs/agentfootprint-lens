import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { ownedCommand } from './owned-command.mjs';

const bounds = { timeout: 2_000, killGraceMs: 30, cleanupTimeoutMs: 1_000,
  drainTimeoutMs: 100, pollIntervalMs: 5 };
// Faulted adapters must not leave the inert fixtures running indefinitely.
const boundedScript = (source) => `setTimeout(()=>process.exit(88),10000).unref();\n${source}`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lens-owned-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, log: join(root, 'command.log'), file(name, source) {
    const path = join(root, name); writeFileSync(path, boundedScript(source)); return path;
  } };
}

const code = (expected) => (error) => error instanceof assert.AssertionError &&
  error.actual?.code === expected;

test('success returns stdout and retains stdout and stderr in its log', async (t) => {
  const f = fixture(t);
  const result = await ownedCommand(process.execPath,
    ['-e', "process.stdout.write('out');process.stderr.write('err')"], { ...bounds, log: f.log });
  assert.equal(result, 'out');
  assert.equal(readFileSync(f.log, 'utf8'), 'outerr');
});

test('nonzero exit refuses and retains output without claiming a timeout', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => ownedCommand(process.execPath,
    ['-e', "console.log('before failure');process.exitCode=7"], { ...bounds, log: f.log }),
  (error) => error instanceof assert.AssertionError && error.actual === 7);
  assert.match(readFileSync(f.log, 'utf8'), /before failure/);
});

test('an unspawned command refuses ENOENT and creates the empty evidence log', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => ownedCommand(join(f.root, 'missing'), [],
    { ...bounds, log: f.log }), code('ENOENT'));
  assert.equal(readFileSync(f.log, 'utf8'), '');
});

test('timeout is retryable only after the direct TERM-resistant child is killed and reaped', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => ownedCommand(process.execPath,
    ['-e', boundedScript("process.on('SIGTERM',()=>{});console.log('started');setInterval(()=>{},1000)")],
    { ...bounds, timeout: 1_000, log: f.log }), code('ETIMEDOUT'));
  assert.match(readFileSync(f.log, 'utf8'), /started/);
});

test('direct parent close does not release a TERM-resistant grandchild before group cleanup', async (t) => {
  const f = fixture(t), marker = join(f.root, 'late-marker');
  const worker = f.file('worker.cjs', `const fs=require('node:fs');process.on('SIGTERM',()=>{});setTimeout(()=>fs.writeFileSync(process.argv[2],'late'),2000);setInterval(()=>{},1000);process.send('ready');`);
  const parent = f.file('parent.cjs', `const {spawn}=require('node:child_process');const p=spawn(process.execPath,[process.argv[2],process.argv[3]],{stdio:['ignore','ignore','ignore','ipc']});p.on('message',()=>console.log('grandchild ready'));setInterval(()=>{},1000);`);
  await assert.rejects(() => ownedCommand(process.execPath, [parent, worker, marker],
    { ...bounds, timeout: 1_000, log: f.log }), code('ETIMEDOUT'));
  assert.match(readFileSync(f.log, 'utf8'), /grandchild ready/);
  await delay(2_100);
  assert.equal(existsSync(marker), false);
});

test('a successful parent leaving an owned group does not report clean success', async (t) => {
  const f = fixture(t), marker = join(f.root, 'late-marker');
  const worker = f.file('worker.cjs', `const fs=require('node:fs');setTimeout(()=>fs.writeFileSync(process.argv[2],'late'),500);setInterval(()=>{},1000);process.send('ready');`);
  const parent = f.file('parent.cjs', `const {spawn}=require('node:child_process');const p=spawn(process.execPath,[process.argv[2],process.argv[3]],{stdio:['ignore','ignore','ignore','ipc']});p.on('message',()=>{console.log('parent success');process.exit(0);});`);
  await assert.rejects(() => ownedCommand(process.execPath, [parent, worker, marker],
    { ...bounds, log: f.log }), code('ERR_PROCESS_GROUP_REMAINED'));
  assert.match(readFileSync(f.log, 'utf8'), /parent success/);
  await delay(550);
  assert.equal(existsSync(marker), false);
});

test('combined output has a finite byte bound and overflow is not retry authority', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => ownedCommand(process.execPath,
    ['-e', boundedScript("process.stdout.write('x'.repeat(8192));setInterval(()=>{},1000)")],
    { ...bounds, maxBuffer: 256, log: f.log }), code('ERR_PROCESS_OUTPUT_LIMIT'));
  assert.equal(readFileSync(f.log).length, 256);
});

test('invalid UTF-8 cannot expand the retained evidence beyond its byte limit', async (t) => {
  const f = fixture(t);
  await assert.rejects(() => ownedCommand(process.execPath,
    ['-e', boundedScript('process.stdout.write(Buffer.alloc(8192,255));setInterval(()=>{},1000)')],
    { ...bounds, maxBuffer: 256, log: f.log }), code('ERR_PROCESS_OUTPUT_LIMIT'));
  assert.deepEqual(readFileSync(f.log), Buffer.alloc(256, 255));
});

test('an escaped owned fixture holding pipes causes bounded refusal, not a hang', async (t) => {
  const f = fixture(t), pidFile = join(f.root, 'escaped.pid');
  const worker = f.file('escaped.cjs', 'setInterval(()=>{},1000);');
  const parent = f.file('parent.cjs', `const fs=require('node:fs');const {spawn}=require('node:child_process');const p=spawn(process.execPath,[process.argv[2]],{detached:true,stdio:['ignore',1,2]});fs.writeFileSync(process.argv[3],String(p.pid));console.log('escaped fixture');process.exit(0);`);
  try {
    await assert.rejects(() => ownedCommand(process.execPath, [parent, worker, pidFile],
      { ...bounds, drainTimeoutMs: 30, log: f.log }), code('ERR_PROCESS_STDIO_OPEN'));
    assert.match(readFileSync(f.log, 'utf8'), /escaped fixture/);
  } finally {
    // The test created this escaped process and retained its PID itself. The
    // command adapter must not guess at or signal groups it did not create.
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, 'utf8'));
      assert.ok(Number.isSafeInteger(pid) && pid > 1);
      try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
});

test('unknown group state refuses cleanup instead of issuing a retryable timeout', async (t) => {
  const f = fixture(t), originalKill = process.kill;
  process.kill = function (pid, signal) {
    if (pid < 0 && signal === 0) throw Object.assign(new Error('inert denied probe'), { code: 'EPERM' });
    return originalKill.call(process, pid, signal);
  };
  try {
    await assert.rejects(() => ownedCommand(process.execPath, ['-e', 'process.exit(0)'],
      { ...bounds, killGraceMs: 0, cleanupTimeoutMs: 20, log: f.log }), code('ERR_PROCESS_GROUP_CLEANUP'));
    assert.equal(readFileSync(f.log, 'utf8'), '');
  } finally { process.kill = originalKill; }
});

test('unsafe timeout, cleanup and output bounds refuse before spawning', async () => {
  for (const options of [{ timeout: 0 }, { timeout: Infinity }, { cleanupTimeoutMs: 0 },
    { killGraceMs: -1 }, { drainTimeoutMs: Infinity }, { maxBuffer: 33 * 1024 * 1024 }]) {
    await assert.rejects(() => ownedCommand(process.execPath, ['-e', 'process.exit(9)'], options), TypeError);
  }
});

test('Windows process-group semantics refuse before any subprocess starts', async (t) => {
  const f = fixture(t), descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
  try {
    await assert.rejects(() => ownedCommand(process.execPath, ['-e', 'process.exit(9)'],
      { ...bounds, log: f.log }), code('ERR_PROCESS_GROUP_UNSUPPORTED'));
    assert.equal(readFileSync(f.log, 'utf8'), '');
  } finally { Object.defineProperty(process, 'platform', descriptor); }
});
