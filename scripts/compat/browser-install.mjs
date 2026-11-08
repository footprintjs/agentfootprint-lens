import { AssertionError } from 'node:assert';
import { join } from 'node:path';
import { command } from './process.mjs';
import { ownedCommand } from './owned-command.mjs';

const policy = Object.freeze({ timeout: 300_000,
  logs: Object.freeze(['browser-install.log', 'browser-install-retry.log']) });

export async function installBrowser({ consumer, evidence }, run = ownedCommand, dependencies = command) {
  // OS provisioning can outlive its caller under sudo. Never retry it after a timeout.
  await dependencies(process.execPath, [join(consumer, 'node_modules/playwright/cli.js'),
    'install-deps', 'chromium'],
  { cwd: consumer, log: join(evidence, 'browser-dependencies.log'), timeout: policy.timeout });
  for (const [attempt, log] of policy.logs.entries()) {
    try {
      // A retry is allowed only after ownedCommand has stopped the download's process group.
      return await run(process.execPath, [join(consumer, 'node_modules/playwright/cli.js'),
        'install', 'chromium'],
      { cwd: consumer, log: join(evidence, log), timeout: policy.timeout });
    } catch (error) {
      if (attempt === policy.logs.length - 1 || !(error instanceof AssertionError) ||
        error.actual?.code !== 'ETIMEDOUT') throw error;
    }
  }
}
