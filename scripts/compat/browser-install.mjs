import { AssertionError } from 'node:assert';
import { join } from 'node:path';
import { command } from './process.mjs';

const policy = Object.freeze({ timeout: 300_000,
  logs: Object.freeze(['browser-install.log', 'browser-install-retry.log']) });

export function installBrowser({ consumer, evidence }, run = command) {
  for (const [attempt, log] of policy.logs.entries()) {
    try {
      return run(process.execPath, [join(consumer, 'node_modules/playwright/cli.js'),
        'install', '--with-deps', 'chromium'],
      { cwd: consumer, log: join(evidence, log), timeout: policy.timeout });
    } catch (error) {
      if (attempt === policy.logs.length - 1 || !(error instanceof AssertionError) ||
        error.actual?.code !== 'ETIMEDOUT') throw error;
    }
  }
}
