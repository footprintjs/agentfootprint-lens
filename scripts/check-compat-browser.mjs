/** Browser integration over normal installed package bytes, never source aliases. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertInstalled, candidate } from './compat/contract.mjs';
import { assertBrowserOutputSafe, assertBrowserOutputUnchanged, captureBrowserOutput } from './compat/browser-output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (index % 2 === 0) { assert.ok(arg.startsWith('--') && all[index + 1], `Invalid option ${arg}`); pairs.push([arg.slice(2), all[index + 1]]); }
  return pairs;
}, []));
for (const field of ['consumer', 'evidence', 'lane', 'flow-version', 'archive-proof']) assert.ok(options[field], `--${field} is required`);
const evidence = resolve(options.evidence);
await mkdir(evidence, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = {
  'tagged-chart.json': 'a716cd14297e018792ef18d92e99fc951f2c5c40e34d4908719c501eb7baa169',
  'flow.json': '6220e9422696028c8ad6f4243bc1c3caa33152a62ca6dcbdf54a17c5bd0259b1',
  'hci.json': 'fc287b4e0c4e955e2d0ec6b1145971e020e829238e0e77bdd0e39d0f614ceee8',
};
const results = [];
const archiveProofBytes = await readFile(resolve(options['archive-proof']));
const archiveProof = JSON.parse(archiveProofBytes);
assert.match(archiveProof.why.sha256, /^[a-f0-9]{64}$/);
assert.match(archiveProof.flow.sha256, /^[a-f0-9]{64}$/);
if (options['flow-version'] === '1.0.0') assert.equal(archiveProof.flow.sha256, candidate.sha256);

async function copyFixture(source, target, name) {
  const bytes = await readFile(source);
  assert.equal(sha(bytes), fixtures[name], `The saved ${name} fixture changed`);
  await writeFile(join(target, name), bytes);
}

async function runBrowser(consumerPath, kind) {
  const consumer = resolve(consumerPath);
  const target = join(consumer, `.compat-browser-${kind}`);
  const proof = join(evidence, kind);
  await mkdir(target, { recursive: true });
  await mkdir(proof, { recursive: true });
  const installed = createRequire(join(consumer, 'package.json'));
  const verifyInstalled = () => {
    assertInstalled(join(consumer, 'node_modules/footprint-explainable-ui'), archiveProof.flow.files, 'browser Flow');
    if (kind === 'replay') assertInstalled(join(consumer, 'node_modules/agentfootprint-lens'), archiveProof.why.files, 'browser Why');
  };
  verifyInstalled();
  const { build, version: viteVersion } = await import(pathToFileURL(installed.resolve('vite')).href);
  const { chromium } = installed('playwright');
  const source = await readFile(join(root, 'test/compat-browser', `${kind}-host.jsx`));
  await writeFile(join(target, 'host.jsx'), source);
  if (kind === 'replay') await copyFixture(join(root, 'test/served/fixtures/tagged-chart.json'), target, 'tagged-chart.json');
  else {
    assert.ok(options['record-fixtures'], '--record-fixtures must name the immutable M6 corpus');
    for (const name of ['flow.json', 'hci.json']) await copyFixture(join(options['record-fixtures'], name), target, name);
    // This explicit DOM host is distinct from the runner's record-only install.
    for (const name of ['agentfootprint-lens', 'agentfootprint', 'footprintjs', 'hcifootprint', 'vizfootprint', '@xyflow/react', 'dagre']) {
      assert.throws(() => installed.resolve(name), { code: 'MODULE_NOT_FOUND' }, `${name} leaked into the record browser host`);
    }
  }
  const output = join(target, 'public');
  await writeFile(join(target, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Lens package compatibility</title><link rel="icon" href="data:,"></head><body style="margin:16px;font-family:system-ui"><div id="root"></div><script type="module" src="/host.jsx"></script></body></html>');
  const chunks = [];
  // Match this project's documented Vite browser host. No aliases, externals,
  // polyfills or shims: the plugin records module metadata, never changes it. Vite may
  // visit unused Node imports while analysing the agent barrel; only retained
  // module bytes can execute. Fail if any Node adapter survives tree shaking.
  await build({ root: target, configFile: false, build: { outDir: output, emptyOutDir: false },
    plugins: [{ name: 'compatibility-evidence', generateBundle(_options, bundle) {
      for (const [file, item] of Object.entries(bundle)) if (item.type === 'chunk') {
        chunks.push({ file, preFinalSha256: sha(item.code), imports: item.imports, dynamicImports: item.dynamicImports,
          modules: Object.fromEntries(Object.entries(item.modules).map(([id, details]) => [
            relative(consumer, id).split(sep).join('/'), { renderedLength: details.renderedLength, renderedExports: details.renderedExports },
          ])) });
      }
    } }] });
  const servedOutput = captureBrowserOutput(output);
  for (const chunk of chunks) {
    assert.ok(servedOutput.files[chunk.file], `The recorded chunk ${chunk.file} was not emitted`);
    chunk.sha256 = servedOutput.files[chunk.file];
  }
  await writeFile(join(proof, 'metafile.json'), JSON.stringify({ bundler: `vite ${viteVersion}`,
    moduleMetadataPhase: 'generateBundle', servedOutputPhase: 'after awaited build', chunks, servedOutput }, null, 2));
  assert.ok(chunks.length, 'A real browser bundle must be emitted');
  const inputs = chunks.flatMap(chunk => Object.entries(chunk.modules).filter(([, details]) => details.renderedLength > 0).map(([id]) => id));
  const forbiddenRuntime = /(?:__vite-browser-external|node_modules\/agentfootprint\/dist\/esm\/(?:lib\/lazyRequire\.js|(?:lib\/semantics|lib\/tool-lint)\/cli\.js|adapters\/|embedders\/|providers(?:\/|\.js)|core\/(?:Agent|RunnerBase|runnerLive|runner|LLMCall|codeRunnerTool)\.js|core\/agent\/stages\/))/;
  assert.deepEqual(inputs.filter(input => forbiddenRuntime.test(input)), [], 'Node adapters or agent execution runtime survived in an offline browser replay');
  assertBrowserOutputSafe(servedOutput);
  assert.ok(inputs.some(input => input.includes('node_modules/footprint-explainable-ui/dist/')), 'Use the installed Flow Lens, never its source');
  if (kind === 'replay') assert.ok(inputs.some(input => input.includes('node_modules/agentfootprint-lens/dist/')), 'Use the installed Why Lens');
  else assert.ok(!inputs.some(input => /node_modules\/(?:agentfootprint(?:-lens)?|footprintjs|hcifootprint|vizfootprint|@xyflow|dagre)\//.test(input)));
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = resolve(output, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
      assert.ok(path.startsWith(`${output}${sep}`));
      const bytes = await readFile(path);
      assert.equal(sha(bytes), servedOutput.files[relative(output, path).split(sep).join('/')], 'Only unchanged captured build bytes may be served');
      response.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const failures = [], requests = [], remote = [];
  let browser, page;
  const versions = { react: installed('react/package.json').version, reactDOM: installed('react-dom/package.json').version };
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const context = await browser.newContext({ viewport: { width: 1680, height: 1100 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => {
      remote.push(socket.url());
      socket.close();
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { remote.push(url.href); await route.abort('blockedbyclient'); return; }
      requests.push(url.pathname);
      await route.continue();
    });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(origin);
    const observations = kind === 'replay' ? await checkReplay(page, proof) : await checkRecord(page, proof);
    assert.deepEqual(remote, [], 'Browser attempted to reach an external service');
    assert.deepEqual(failures, [], 'Browser errors are genuine compatibility failures');
    verifyInstalled();
    assertBrowserOutputUnchanged(output, servedOutput);
    const result = { passed: true, kind, lane: options.lane, flowVersion: options['flow-version'], versions,
      archiveProof, archiveProofSha256: sha(archiveProofBytes),
      fixtureHashes: kind === 'replay' ? { 'tagged-chart.json': fixtures['tagged-chart.json'] } : { 'flow.json': fixtures['flow.json'], 'hci.json': fixtures['hci.json'] },
      hostSha256: sha(source), bundle: chunks.map(({ file, sha256 }) => ({ file, sha256 })),
      servedOutput,
      bundler: `vite ${viteVersion}`, browser: { version: browser.version(), executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'Playwright-managed Chromium' },
      requests, remote, failures, observations };
    await writeFile(join(proof, 'verification.json'), JSON.stringify(result, null, 2));
    results.push(result);
  } catch (error) {
    await page?.screenshot({ path: join(proof, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(join(proof, 'failure.json'), JSON.stringify({ passed: false, error: error.stack, requests, remote, failures }, null, 2));
    throw error;
  } finally {
    try { await browser?.close(); } finally { await new Promise(done => server.close(done)); }
  }
}

async function checkReplay(page, proof) {
  const observations = [];
  // Literal independent oracle from the saved five-commit source, not agreement
  // between renderers or a generated fixture rewritten to fit the candidate.
  const commits = JSON.parse(await page.getByTestId('recorded-commits').textContent());
  assert.deepEqual(commits.map(row => [row.runtimeStageId, row.overwriteKeys]), [
    ['seed#0', ['trail', 'n']], ['call-llm#1', ['trail', 'n']],
    ['normalise#2', ['trail', 'n']], ['route#3', ['trail', 'n']], ['finish#4', ['trail', 'n']],
  ]);
  const now = id => page.locator(`.react-flow__node[data-id="${id}"]`).getByText('NOW', { exact: true });
  const steps = { seed: 1, 'call-llm': 2, normalise: 3, route: 4, finish: 5 };
  const assertCurrent = async (id, color) => {
    await now(id).waitFor();
    assert.equal(await page.locator('.react-flow__node').getByText('NOW', { exact: true }).count(), 1);
    const rail = page.getByRole('group', { name: 'Steps', exact: true });
    assert.equal(await rail.getByRole('button').count(), 5, 'This recording has five native Why commit stops, not Foottrace bookends');
    assert.equal(await rail.getByRole('button', { name: `Go to step ${steps[id]}`, exact: true }).getAttribute('aria-current'), 'step');
    assert.equal(await rail.locator('[aria-current="step"]').count(), 1, 'The native transport and graph share one cursor');
    await page.waitForFunction(({ stageId, expected }) => {
      const node = document.querySelector(`.react-flow__node[data-id="${stageId}"]`);
      return node && [...node.querySelectorAll('div')].some(element => getComputedStyle(element).backgroundColor === expected);
    }, { stageId: id, expected: color });
    observations.push({ entry: await page.getByTestId('host-mode').textContent(), stage: id, railStep: steps[id], railStops: 5, color });
  };
  for (const entry of ['replay', 'observed']) {
    await page.getByTestId('host-mode').filter({ hasText: `${entry}:light` }).waitFor();
    await assertCurrent('finish', 'rgb(210, 70, 119)');
    await page.screenshot({ path: join(proof, `${entry}-initial.png`), fullPage: true });
    for (const id of ['route', 'normalise', 'call-llm', 'seed']) {
      await page.getByRole('button', { name: 'Previous step', exact: true }).click();
      await assertCurrent(id, 'rgb(210, 70, 119)');
    }
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await assertCurrent('call-llm', 'rgb(210, 70, 119)');
    await page.getByRole('button', { name: 'Change theme', exact: true }).click();
    await page.getByTestId('host-mode').filter({ hasText: `${entry}:dark` }).waitFor();
    await assertCurrent('call-llm', 'rgb(18, 171, 52)');
    await page.screenshot({ path: join(proof, `${entry}-historical.png`), fullPage: true });
    // Composite Lens clicks drill a group. This plain Flow recording carries
    // no boundaries, so a chart click must not invent a new cursor position.
    await page.locator('.react-flow__node[data-id="route"]').click();
    await assertCurrent('call-llm', 'rgb(18, 171, 52)');
    await page.getByRole('button', { name: 'Go to step 4', exact: true }).click();
    await assertCurrent('route', 'rgb(18, 171, 52)');
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await assertCurrent('finish', 'rgb(18, 171, 52)');
    await page.screenshot({ path: join(proof, `${entry}.png`), fullPage: true });
    if (entry === 'replay') {
      await page.getByRole('button', { name: 'Change theme', exact: true }).click();
      await page.getByRole('button', { name: 'Change public entry', exact: true }).click();
    }
  }
  return observations;
}

async function checkRecord(page, proof) {
  const observations = [];
  const model = async () => JSON.parse(await page.getByTestId('record-model').textContent());
  const checkValue = async (key, expected, writer) => {
    const actual = await model();
    assert.equal(actual.status, 'ready');
    assert.deepEqual(actual.folded.state[key], expected);
    assert.equal(actual.provenance.status, 'ready');
    assert.equal(actual.provenance.slice.writer.runtimeStageId, writer);
    const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: `Explain ${key}`, exact: true }) });
    await row.waitFor();
    assert.ok((await row.textContent()).includes(String(expected)), 'Recorded value must be visible, not just present in a diagnostic model');
    await page.getByText(actual.provenance.prose, { exact: true }).waitFor();
    observations.push({ sourceId: actual.sourceId, step: actual.step, key, value: expected, writer, prose: actual.provenance.prose });
  };
  await checkValue('net', 95, 'total#1');
  await page.getByLabel('Step', { exact: true }).selectOption('4');
  await checkValue('net', 80, 'revise#4');
  await page.getByRole('button', { name: 'Child recording', exact: true }).click();
  await checkValue('approved', true, 'review/check#3');
  assert.equal((await model()).folded.state.net, 95);
  await page.getByRole('button', { name: 'HCI recording', exact: true }).click();
  await checkValue('orderId', 'demo-order-1', 'checkout#3');
  const final = await model();
  assert.deepEqual(final.folded.state.items, [{ id: 'p1' }, { id: 'p2' }]);
  assert.equal(final.folded.state.itemCount, 2);
  assert.equal(final.folded.state.privateNote, 'REDACTED');
  assert.ok(!final.stops.some(stop => stop.runtimeStageId === 'add#4'));
  await page.getByLabel('Step', { exact: true }).selectOption('2');
  assert.equal((await model()).provenance.slice.missing, 'never-written');
  await page.getByLabel('Step', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Explain privateNote', exact: true }).click();
  assert.ok((await model()).provenance.slice.notes.some(note => note.code === 'redacted'));
  await page.screenshot({ path: join(proof, 'record.png'), fullPage: true });
  return observations;
}

try {
  await runBrowser(options.consumer, 'replay');
  if (options['flow-version'] === '1.0.0') {
    assert.ok(options['record-consumer'], 'Every candidate lane requires its separate /record browser host');
    await runBrowser(options['record-consumer'], 'record');
  } else assert.ok(!options['record-consumer'], 'Old Flow releases do not provide /record');
  await writeFile(join(evidence, 'verification.json'), JSON.stringify({ passed: true, lane: options.lane, results }, null, 2));
  console.log(`Installed browser compatibility passed: ${options.lane}`);
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ passed: false, lane: options.lane, error: error.stack, results }, null, 2));
  throw error;
}
