import assert from 'node:assert/strict';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, tooling } from './contract.mjs';

// Official MCR index and microsoft/playwright v1.63.0 browsers.json. Updating
// the image also requires checking its bundled browser metadata, not only a tag.
export const bundledBrowser = Object.freeze({
  image: 'mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27',
  playwrightVersion: '1.63.0', chromiumRevision: '1243', chromiumVersion: '153.0.8010.12',
  browserRoot: '/ms-playwright',
});

function executableWithinRoot(executable, root, revision) {
  assert.ok(typeof executable === 'string' && isAbsolute(executable) && resolve(executable) === executable,
    'Bundled executable must be an absolute canonical path');
  const parts = relative(root, executable).split(sep);
  assert.ok(parts[0] !== '..' && parts[0] !== '' && !isAbsolute(parts[0]), 'Bundled executable is outside the browser root');
  assert.equal(parts[0], `chromium-${revision}`, 'Bundled Chromium revision differs from the pinned image');
}

function installedPlaywright(consumer) {
  const installed = createRequire(join(consumer, 'package.json'));
  return { version: installed('playwright/package.json').version, chromium: installed('playwright').chromium };
}

export async function probeBundledBrowser({ consumer, bundle = bundledBrowser }, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  const environment = runtime.environment ?? process.env;
  assert.equal(platform, 'linux', 'Bundled browser provisioning requires Linux');
  assert.equal(bundle.playwrightVersion, tooling.playwright, 'Bundled image must match the declared Playwright version');
  assert.equal(environment.PLAYWRIGHT_BROWSERS_PATH, bundle.browserRoot, 'PLAYWRIGHT_BROWSERS_PATH must name the bundled image root');
  const { version, chromium } = (runtime.loadPlaywright ?? installedPlaywright)(consumer);
  assert.equal(version, bundle.playwrightVersion, 'Installed Playwright version differs from the bundled image');
  assert.equal(chromium.name(), 'chromium', 'Bundled proof requires Chromium');
  const root = realpathSync(bundle.browserRoot), executablePath = realpathSync(chromium.executablePath());
  executableWithinRoot(executablePath, root, bundle.chromiumRevision);
  assert.ok(statSync(executablePath).isFile(), 'Bundled executable must be a file');
  accessSync(executablePath, constants.X_OK);
  const override = environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  assert.ok(!override || override === executablePath, 'A different Chromium executable override is refused');
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, timeout: 20_000 });
    const browserVersion = browser.version();
    assert.equal(browserVersion, bundle.chromiumVersion, 'Running Chromium version differs from the pinned image');
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>waiting</title><button type="button" onclick="document.title=\'bundled-browser-ready\'">Verify bundled browser</button>', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Verify bundled browser' }).click({ timeout: 10_000 });
    assert.equal(await page.title(), 'bundled-browser-ready', 'Bundled Chromium page interaction failed');
    return Object.freeze({ schema: 1, strategy: 'bundled', image: bundle.image,
      playwrightVersion: version, chromiumRevision: bundle.chromiumRevision, browserVersion,
      executablePath, smoke: 'passed' });
  } finally { await browser?.close(); }
}

export function readBundledReceipt(output) {
  assert.ok(typeof output === 'string' && Buffer.byteLength(output) <= 16_384, 'Invalid bundled proof receipt');
  const receipt = JSON.parse(output);
  assert.equal(receipt?.schema, 1); assert.equal(receipt.strategy, 'bundled');
  assert.equal(receipt.image, bundledBrowser.image);
  assert.equal(receipt.playwrightVersion, bundledBrowser.playwrightVersion);
  assert.equal(receipt.chromiumRevision, bundledBrowser.chromiumRevision);
  assert.equal(receipt.browserVersion, bundledBrowser.chromiumVersion);
  assert.equal(receipt.smoke, 'passed');
  executableWithinRoot(receipt.executablePath, bundledBrowser.browserRoot, bundledBrowser.chromiumRevision);
  return Object.freeze(receipt);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), ['consumer']);
  assert.ok(flags.consumer, '--consumer is required');
  console.log(JSON.stringify(await probeBundledBrowser({ consumer: resolve(flags.consumer) })));
}
