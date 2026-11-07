import { AssertionError } from 'node:assert';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const OUTPUT_LIMIT = 32 * 1024 * 1024;

function bounded(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`Invalid owned command ${name}`);
  }
  return value;
}

function refusal(code, log, actual = Object.assign(new Error(code), { code })) {
  return new AssertionError({ actual, expected: undefined, operator: 'strictEqual',
    message: `Owned subprocess refused: ${code}; log: ${log ?? '(none)'}` });
}

/** Probe only the process group created by this invocation. Unknown never means absent. */
function groupState(pid) {
  try { process.kill(-pid, 0); return 'present'; }
  catch (error) { return error.code === 'ESRCH' ? 'absent' : 'unknown'; }
}

function signalGroup(pid, signal) {
  try { process.kill(-pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') return false; }
  return true;
}

async function until(check, milliseconds, interval) {
  const deadline = Date.now() + milliseconds;
  while (!check()) {
    const left = deadline - Date.now();
    if (left <= 0) return check();
    await delay(Math.min(interval, left));
  }
  return true;
}

async function settles(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise.then(() => true), new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/**
 * Download-process adapter. It never retries or runs privileged setup.
 * A retryable timeout means the owned POSIX group is absent AND the direct child
 * was reaped. Pipe drain and TERM/KILL cleanup have their own finite bounds.
 */
export async function ownedCommand(command, args, {
  cwd, log, env = {}, timeout = 300_000, killGraceMs = 250,
  cleanupTimeoutMs = 2_000, drainTimeoutMs = 500, pollIntervalMs = 10,
  maxBuffer = OUTPUT_LIMIT,
} = {}) {
  bounded(timeout, 1, 300_000, 'timeout');
  bounded(killGraceMs, 0, 5_000, 'kill grace');
  bounded(cleanupTimeoutMs, 1, 5_000, 'cleanup timeout');
  bounded(drainTimeoutMs, 1, 5_000, 'drain timeout');
  bounded(pollIntervalMs, 1, 100, 'poll interval');
  bounded(maxBuffer, 1, OUTPUT_LIMIT, 'output limit');
  if (process.platform === 'win32') {
    if (log) await writeFile(log, '');
    throw refusal('ERR_PROCESS_GROUP_UNSUPPORTED', log);
  }

  let child;
  try {
    child = spawn(command, args, { cwd, env: { ...process.env, ...env },
      detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (log) await writeFile(log, '');
    throw refusal(error.code ?? 'ERR_PROCESS_SPAWN', log);
  }

  const stdout = [], stderr = [];
  let bytes = 0, overflow = false, direct, causeResolve, timer;
  const cause = new Promise((resolve) => { causeResolve = resolve; });
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.once('error', (error) => causeResolve({ kind: 'spawn', error }));
  child.once('exit', (code, signal) => {
    direct = { code, signal };
    causeResolve({ kind: 'exit' });
  });
  const collect = (parts, chunk) => {
    const remaining = maxBuffer - bytes;
    if (remaining > 0) {
      const kept = chunk.subarray(0, remaining);
      parts.push(Buffer.from(kept));
      bytes += kept.length;
    }
    if (chunk.length > remaining) {
      overflow = true;
      causeResolve({ kind: 'overflow' });
    }
  };
  child.stdout.on('data', (chunk) => collect(stdout, chunk));
  child.stderr.on('data', (chunk) => collect(stderr, chunk));
  child.stdout.once('error', () => causeResolve({ kind: 'stdio' }));
  child.stderr.once('error', () => causeResolve({ kind: 'stdio' }));
  timer = setTimeout(() => causeResolve({ kind: 'timeout' }), timeout);

  let failure;
  try {
    const initial = await cause;
    clearTimeout(timer);
    const pid = child.pid;
    const remaining = pid === undefined ? 'absent' : groupState(pid);
    const lingering = initial.kind === 'exit' && remaining !== 'absent';
    const mustStop = pid !== undefined &&
      (initial.kind !== 'exit' || remaining !== 'absent');
    let cleaned = true;
    if (mustStop) {
      const stopped = () => direct !== undefined && groupState(pid) === 'absent';
      signalGroup(pid, 'SIGTERM');
      cleaned = await until(stopped, killGraceMs, pollIntervalMs);
      if (!cleaned) {
        signalGroup(pid, 'SIGKILL');
        cleaned = await until(stopped, cleanupTimeoutMs, pollIntervalMs);
      }
    }
    const drained = await settles(closed, drainTimeoutMs);
    if (!cleaned) failure = refusal('ERR_PROCESS_GROUP_CLEANUP', log);
    else if (!drained) failure = refusal('ERR_PROCESS_STDIO_OPEN', log);
    else if (overflow) failure = refusal('ERR_PROCESS_OUTPUT_LIMIT', log);
    else if (initial.kind === 'timeout') failure = refusal('ETIMEDOUT', log);
    else if (initial.kind === 'spawn') failure = refusal(initial.error.code ?? 'ERR_PROCESS_SPAWN', log);
    else if (initial.kind === 'stdio') failure = refusal('ERR_PROCESS_STDIO', log);
    else if (lingering) failure = refusal('ERR_PROCESS_GROUP_REMAINED', log);
    else if (direct?.code !== 0) failure = refusal('ERR_PROCESS_EXIT', log, direct?.code ?? direct?.signal);

    const output = Buffer.concat([...stdout, ...stderr]);
    if (log) await writeFile(log, output);
    if (failure) throw failure;
    return Buffer.concat(stdout).toString('utf8');
  } finally {
    clearTimeout(timer);
    // Escaped descendants may retain inherited pipes. Do not wait on or signal
    // an unowned group; close our pipe ends and refuse instead.
    child.stdout.destroy();
    child.stderr.destroy();
  }
}
