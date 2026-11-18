import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { bundledBrowser, probeBundledBrowser } from './browser-bundled.mjs';

// Inert public-runtime fixtures; actual Chromium launch and the full replay
// remain mandatory in every hosted matrix lane. These tests need no installs.
function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lens-bundled-browser-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'ms-playwright');
  const executable = join(root, `chromium-${bundledBrowser.chromiumRevision}`, 'chrome-linux64', 'chrome');
  mkdirSync(join(executable, '..'), { recursive: true }); writeFileSync(executable, 'inert fixture\n', { mode: 0o755 });
  const bundle = { ...bundledBrowser, browserRoot: root };
  const state = { version: bundle.chromiumVersion, driver: bundle.playwrightVersion, engine: 'chromium',
    executable, loads: 0, launches: [], closes: 0, clicked: false, smoke: true };
  const browser = {
    version: () => state.version,
    newPage: async () => ({
      setContent: async html => { assert.match(html, /bundled-browser-ready/); },
      getByRole: (role, options) => {
        assert.equal(role, 'button'); assert.equal(options.name, 'Verify bundled browser');
        return { click: async () => { if (state.smoke) state.clicked = true; } };
      },
      title: async () => state.clicked ? 'bundled-browser-ready' : 'not-clicked',
    }),
    close: async () => { state.closes += 1; },
  };
  const runtime = { platform: 'linux', environment: { PLAYWRIGHT_BROWSERS_PATH: root },
    loadPlaywright: consumer => {
      assert.equal(consumer, directory); state.loads += 1;
      return { version: state.driver, chromium: { name: () => state.engine, executablePath: () => state.executable,
        launch: async options => { state.launches.push(options); return browser; } } };
    } };
  return { input: { consumer: directory, bundle }, runtime, state, browser, executable, directory };
}

test('bundled proof checks the actual engine, revision, executable, version and page interaction', async t => {
  const f = fixture(t); const result = await probeBundledBrowser(f.input, f.runtime);
  assert.deepEqual(result, { schema: 1, strategy: 'bundled', image: bundledBrowser.image,
    playwrightVersion: bundledBrowser.playwrightVersion, chromiumRevision: bundledBrowser.chromiumRevision,
    browserVersion: bundledBrowser.chromiumVersion, executablePath: f.executable, smoke: 'passed' });
  assert.deepEqual(f.state.launches, [{ executablePath: f.executable, headless: true, timeout: 20_000 }]);
  assert.equal(f.state.clicked, true); assert.equal(f.state.closes, 1);
});

test('bundled proof refuses a wrong platform or browser root before loading a runtime', async t => {
  const f = fixture(t);
  await assert.rejects(probeBundledBrowser(f.input, { ...f.runtime, platform: 'darwin' }), /Linux/);
  f.runtime.environment.PLAYWRIGHT_BROWSERS_PATH = '/different-browser-root';
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /PLAYWRIGHT_BROWSERS_PATH/);
  assert.equal(f.state.loads, 0); assert.equal(f.state.launches.length, 0);
});

test('bundled proof refuses an installed driver version or engine that differs from the image', async t => {
  const f = fixture(t); f.state.driver = '1.62.0';
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /Playwright version/);
  f.state.driver = bundledBrowser.playwrightVersion; f.state.engine = 'webkit';
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /Chromium/);
  assert.equal(f.state.launches.length, 0);
});

test('bundled proof refuses a missing or non-executable native binary', async t => {
  const f = fixture(t); rmSync(f.executable);
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /ENOENT/);
  writeFileSync(f.executable, 'inert fixture\n', { mode: 0o644 });
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /EACCES/);
  assert.equal(f.state.launches.length, 0);
});

test('bundled proof refuses a different revision, escaped symlink or executable override', async t => {
  const f = fixture(t), other = join(f.directory, 'other-chrome'); writeFileSync(other, 'inert\n', { mode: 0o755 });
  const wrong = join(f.input.bundle.browserRoot, 'chromium-1', 'chrome');
  mkdirSync(join(wrong, '..'), { recursive: true }); writeFileSync(wrong, 'inert\n', { mode: 0o755 });
  f.state.executable = wrong;
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /revision/);
  f.state.executable = f.executable; rmSync(f.executable); symlinkSync(other, f.executable);
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /outside/);
  rmSync(f.executable); writeFileSync(f.executable, 'inert\n', { mode: 0o755 });
  f.runtime.environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = other;
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /override/);
  assert.equal(f.state.launches.length, 0);
});

test('a running binary with the wrong native version fails closed and is closed once', async t => {
  const f = fixture(t); f.state.version = '1.2.3.4';
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /Chromium version/);
  assert.equal(f.state.launches.length, 1); assert.equal(f.state.closes, 1); assert.equal(f.state.clicked, false);
});

test('a failed page interaction fails the proof and closes the launched browser', async t => {
  const f = fixture(t); f.state.smoke = false;
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), /interaction/);
  assert.equal(f.state.closes, 1);
});

test('a page error preserves its failure while still closing the browser', async t => {
  const f = fixture(t), failure = Error('inert page failure');
  f.browser.newPage = async () => { throw failure; };
  await assert.rejects(probeBundledBrowser(f.input, f.runtime), error => error === failure);
  assert.equal(f.state.closes, 1);
});
