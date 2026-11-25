// One isolated, retained consumer. Node selection belongs to the caller/CI;
// this runner checks it, never substitutes a different interpreter on failure.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEvidenceOutsideRepository, assertInstalled, assertLazyRendererIntegrity, assertRecordIsolation, assertSingleFoottrace, lazyRenderer, installedPackageNames, readActiveCohort,
  laneContract, parseFlags, sha256, tooling } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';
import { assertPublishedReceipt, assertRegistryLock, readPublishedAgent } from './published-proof.mjs';
import { assertWhyIdentity } from './why-identity.mjs';
import { installBrowser } from './browser-install.mjs';
import { assertNarrativeRejection, assertNarrativeRendererBytes, narrativeRenderer } from './narrative-renderers.mjs';
import { readRecordFixtures, recordRenderer } from './record-renderer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const flags = parseFlags(process.argv.slice(2),
  ['kind', 'flow', 'react', 'node', 'artifacts', 'evidence', 'browser', 'install-browser', 'browser-provisioning']);
const browserStrategy = flags['browser-provisioning'] ?? 'network';
assert.ok(['network', 'bundled'].includes(browserStrategy), 'Unknown browser provisioning strategy');
if (flags['browser-provisioning'] !== undefined) assert.ok(flags['install-browser'] === 'yes' && flags.browser !== 'no',
  'An explicit browser provisioning strategy requires --install-browser yes and browser replay');
const cohort = readActiveCohort();
const agentIdentity = readPublishedAgent(cohort);
const lane = laneContract(flags, cohort);
assert.equal(process.versions.node.split('.')[0], lane.node, 'run this lane with its declared Node major');
assert.ok(flags.artifacts && flags.evidence, '--artifacts and --evidence are required');
const artifacts = resolve(flags.artifacts);
const evidence = resolve(flags.evidence);
assertEvidenceOutsideRepository(root, evidence);
mkdirSync(dirname(evidence), { recursive: true });
mkdirSync(evidence); // A repeated run must not overwrite an earlier failure's evidence.
const report = { schema: 1, lane, node: process.version, npm: command('npm', ['--version']).trim(),
  browserProvisioning: browserStrategy, status: 'running', steps: [], packages: {} };
writeJson(join(evidence, 'verification.json'), report);

async function step(name, run) {
  await run(); report.steps.push(name); writeJson(join(evidence, 'verification.json'), report);
}
function verifyConsumerLock(directory) {
  const lock = JSON.parse(readFileSync(join(directory, 'package-lock.json'), 'utf8'));
  for (const expected of Object.values(cohort.packages)) assertRegistryLock(lock, expected);
}
function install(directory, dependencies, label) {
  const resolution = `${directory}-resolve`;
  mkdirSync(resolution);
  mkdirSync(directory); // A different fresh copy replays the generated lock.
  writeJson(join(resolution, 'package.json'), { name: `lens-${label}`, version: '1.0.0', private: true, dependencies });
  command('npm', ['install', '--package-lock-only', '--strict-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: resolution, log: join(evidence, `${label}-resolve.log`) });
  if (label === 'consumer') verifyConsumerLock(resolution);
  for (const name of ['package.json', 'package-lock.json']) copyFileSync(join(resolution, name), join(directory, name));
  command('npm', ['ci', '--strict-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: directory, log: join(evidence, `${label}-ci.log`) });
  command('npm', ['ls', '--all', '--json'], { cwd: directory, log: join(evidence, `${label}-tree.json`) });
  if (label === 'consumer') verifyConsumerLock(directory);
}
function checkTypes(consumer, stem, toolConsumer = consumer, verifyRejection) {
  const tsc = join(toolConsumer, 'node_modules/typescript/bin/tsc');
  const common = ['--noEmit', '--pretty', 'false', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--types', 'react', '--lib', 'ES2022,DOM,DOM.Iterable'];
  for (const [mode, extension, resolution, module] of [
    ['nodenext-esm', 'mts', 'NodeNext', 'NodeNext'],
    ['nodenext-cjs', 'cts', 'NodeNext', 'NodeNext'],
    ['bundler', 'ts', 'Bundler', 'ESNext'],
  ]) {
    const fixture = `${stem}.${extension}`;
    const output = command(process.execPath, [tsc, ...common, '--module', module, '--moduleResolution', resolution, fixture],
      { cwd: consumer, expectedStatus: verifyRejection ? 2 : 0,
        log: join(evidence, `${dirname(consumer) === evidence ? consumer.split('/').at(-1) : 'types'}-${stem}-${mode}.log`) });
    verifyRejection?.(output, fixture);
  }
}

try {
  const contract = JSON.parse(readFileSync(join(artifacts, 'contract.json'), 'utf8'));
  const whyIdentity = assertWhyIdentity(contract);
  assert.deepEqual(contract.cohort, cohort, 'artifact cohort must match this manifest and committed lock');
  if (process.env.GITHUB_RUN_ID) {
    assert.equal(contract.source.workflowRun, process.env.GITHUB_RUN_ID,
      'Why artifact must come from this workflow, not a prior build');
    assert.equal(contract.source.workflowAttempt, process.env.GITHUB_RUN_ATTEMPT);
    assert.equal(contract.source.whyCommit, process.env.GITHUB_SHA, 'Why archive source does not match this checked commit');
  }
  const why = inspectArchive(join(artifacts, whyIdentity.filename), evidence,
    { ...whyIdentity, expectedSha: contract.why.sha256 });
  assert.deepEqual(why.files, contract.why.files);
  report.packages.why = { sha256: why.sha256, files: why.files, source: contract.source };
  assert.equal(contract.agent.path, agentIdentity.filename);
  const agent = inspectArchive(join(artifacts, contract.agent.path), evidence,
    { ...agentIdentity, expectedSha: contract.agent.sha256 });
  assert.deepEqual(agent.files, contract.agent.files);
  const agentSource = assertPublishedReceipt(contract.agentSource, readFileSync(agent.path), agentIdentity);
  report.packages.agent = { sha256: agent.sha256, source: agentSource };
  const publishedPeers = {};
  for (const name of ['footprintjs', 'foottrace']) {
    const expected = cohort.packages[name];
    const { archive: declared, receipt } = contract.publishedPeers[name];
    assert.equal(declared.path, expected.filename);
    const archive = inspectArchive(join(artifacts, expected.filename), evidence,
      { ...expected, expectedSha: declared.sha256 });
    assertPublishedReceipt(receipt, readFileSync(archive.path), expected);
    assert.deepEqual(archive.files, declared.files);
    publishedPeers[name] = archive;
    report.packages[name] = { sha256: archive.sha256, source: receipt };
  }

  function verifyRecordOwner(directory) {
    const modules = join(directory, 'node_modules');
    assertSingleFoottrace(modules, cohort.pins.foottrace);
    assertInstalled(join(modules, 'foottrace'), publishedPeers.foottrace.files, 'record-only Foottrace');
  }

  // Every renderer is the published registry archive; the pinned ones are
  // checked by SRI, SHA1, SHA256 and size before any install.
  const narrativeIdentity = narrativeRenderer(lane.flow);
  const recordLane = lane.flow === recordRenderer.version;
  const packed = JSON.parse(command('npm', ['pack', narrativeIdentity?.tarball ?? `footprint-explainable-ui@${lane.flow}`, '--ignore-scripts',
    '--json', '--pack-destination', evidence], { cwd: evidence, log: join(evidence, 'published-flow-pack.log') }));
  assert.equal(packed.length, 1);
  const flowArchive = join(evidence, `footprint-explainable-ui-${lane.flow}.tgz`);
  assert.equal(packed[0].filename, `footprint-explainable-ui-${lane.flow}.tgz`);
  if (narrativeIdentity) {
    assert.equal(packed[0].integrity, narrativeIdentity.integrity, 'published renderer pack SRI');
    assert.equal(packed[0].shasum, narrativeIdentity.shasum, 'published renderer pack SHA1');
    assertNarrativeRendererBytes(narrativeIdentity, readFileSync(flowArchive));
    report.narrativeRenderer = narrativeIdentity;
  }
  const flow = inspectArchive(flowArchive, evidence, { name: 'footprint-explainable-ui', version: lane.flow,
    expectedSha: narrativeIdentity?.sha256 });
  if (lane.flow === lazyRenderer.version) {
    assertLazyRendererIntegrity(packed[0].integrity,
      `sha512-${createHash('sha512').update(readFileSync(flow.path)).digest('base64')}`);
    report.lazyRenderer = lazyRenderer;
  }
  report.packages.flow = { sha256: flow.sha256, files: flow.files };
  writeJson(join(evidence, 'archive-proof.json'), { ...report.packages, recordRenderer: recordLane ? recordRenderer : null });
  const consumer = join(evidence, 'consumer');
  await step('strict fresh peer install', () => install(consumer, {
    ...lane.peers, ...lane.types, ...tooling,
    'agentfootprint-lens': `file:${why.path}`, 'footprint-explainable-ui': `file:${flow.path}`,
  }, 'consumer'));
  const whyInstalled = join(consumer, 'node_modules/agentfootprint-lens');
  const flowInstalled = join(consumer, 'node_modules/footprint-explainable-ui');
  function verifyBytes() {
    assertInstalled(whyInstalled, why.files, 'Why');
    assertInstalled(join(consumer, 'node_modules/agentfootprint'), agent.files, 'AgentFootprint');
    report.recordOwner = assertSingleFoottrace(join(consumer, 'node_modules'), cohort.pins.foottrace);
    for (const [name, archive] of Object.entries(publishedPeers)) {
      assertInstalled(join(consumer, 'node_modules', name), archive.files, name);
      assert.equal(sha256(readFileSync(archive.path)), archive.sha256, `${name} archive changed during checks`);
    }
    assertInstalled(flowInstalled, flow.files, 'Flow');
    assert.equal(sha256(readFileSync(why.path)), why.sha256, 'Why archive changed during checks');
    assert.equal(sha256(readFileSync(agent.path)), agent.sha256, 'AgentFootprint archive changed during checks');
    assert.equal(sha256(readFileSync(flow.path)), flow.sha256, 'Flow archive changed during checks');
  }
  await step('all installed bytes equal the archives before probes', verifyBytes);
  await step('all five ESM/CJS doors, canonical owner, native recording, replay and SSR', () => {
    copyFileSync(join(root, 'scripts/check-packed-peers.mjs'), join(consumer, 'check-packed-peers.mjs'));
    copyFileSync(join(root, 'scripts/check-native-recording.mjs'), join(consumer, 'check-native-recording.mjs'));
    writeJson(join(consumer, 'expected-cohort.json'), cohort);
    command(process.execPath, ['check-packed-peers.mjs'], { cwd: consumer, log: join(evidence, 'runtime.log') });
    command(process.execPath, ['check-native-recording.mjs'], { cwd: consumer, log: join(evidence, 'native-recording.log') });
  });
  await step('strict NodeNext ESM/CJS and Bundler declarations, with negative controls', () => {
    for (const extension of ['mts', 'cts', 'ts']) copyFileSync(join(root, 'scripts/check-packed-peer-types.ts'),
      join(consumer, `check-packed-peer-types.${extension}`));
    checkTypes(consumer, 'check-packed-peer-types');
  });

  if (narrativeIdentity) {
    await step(`strict full engine narrative ${narrativeIdentity.acceptsNarrative ? 'accepted' : 'rejected at the argument'}`, () => {
      const stem = 'check-narrative-renderer-types';
      const fixture = readFileSync(join(root, 'scripts', `${stem}.ts`));
      for (const extension of ['mts', 'cts', 'ts']) writeFileSync(join(consumer, `${stem}.${extension}`), fixture);
      checkTypes(consumer, stem, consumer, narrativeIdentity.acceptsNarrative ? undefined : assertNarrativeRejection);
      report.narrativeDeclaration = { fixtureSha256: sha256(fixture), accepted: narrativeIdentity.acceptsNarrative };
    });
  }

  if (lane.flow === lazyRenderer.version) {
    await step('packed lazy recording codec and native source lifecycle', () => {
      copyFileSync(join(root, 'src/core/__fixtures__/recorded-turn.json'), join(consumer, 'lazy-recorded-turn.json'));
      copyFileSync(join(root, 'scripts/check-lazy-recording.mjs'), join(consumer, 'check-lazy-recording.mjs'));
      command(process.execPath, ['check-lazy-recording.mjs'], { cwd: consumer, log: join(evidence, 'lazy-recording-runtime.log') });
    });
    await step('lazy source public types under all strict declaration resolutions', () => {
      for (const extension of ['mts', 'cts', 'ts']) copyFileSync(join(root, 'scripts/check-lazy-recording-types.ts'),
        join(consumer, `check-lazy-recording-types.${extension}`));
      checkTypes(consumer, 'check-lazy-recording-types');
    });
  }

  let recordConsumer;
  let recordOnly;
  if (recordLane) {
    const fixtures = readRecordFixtures();
    recordOnly = join(evidence, 'record-only');
    await step('separate normal record-only install has no engines or graph peers', () => {
      install(recordOnly, {
        'footprint-explainable-ui': `file:${flow.path}`, foottrace: cohort.pins.foottrace, react: lane.peers.react,
        '@types/react': lane.types['@types/react'],
      }, 'record-only');
      const packages = installedPackageNames(join(recordOnly, 'node_modules'));
      assertRecordIsolation(packages, lane.react);
      report.recordOnly = { packages };
      verifyRecordOwner(recordOnly);
      assertInstalled(join(recordOnly, 'node_modules/footprint-explainable-ui'), flow.files, 'record-only Flow');
    });
    await step('record-only ESM/CJS public viewer and literal saved-record expectations', () => {
      // The vendored corpus and its expectations, each checked by its pinned SHA256.
      readRecordFixtures(fixtures);
      for (const [filename, digest] of Object.entries(recordRenderer.fixtures)) {
        copyFileSync(join(fixtures, filename), join(recordOnly, filename));
        assert.equal(sha256(readFileSync(join(recordOnly, filename))), digest, `copied ${filename} changed`);
      }
      const source = `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const verify = require('./runtime-fixtures.cjs');
for (const [format, load] of [['ESM', (name) => import(name)], ['CJS', (name) => require(name)]]) {
  const viewer = await load('footprint-explainable-ui/record');
  const record = await load('foottrace');
  assert.equal(typeof viewer.RecordLens, 'function');
  assert.equal(typeof viewer.buildRecordLensModel, 'function');
  console.log(format, JSON.stringify(verify(viewer, record)));
}
`;
      writeFileSync(join(recordOnly, 'check-record.mjs'), source);
      command(process.execPath, ['check-record.mjs'], { cwd: recordOnly, log: join(evidence, 'record-runtime.log') });
    });
    await step('record-only public declarations under all strict resolutions', () => {
      const source = "import { RecordLens } from 'footprint-explainable-ui/record';\nexport const Viewer = RecordLens;\n";
      for (const extension of ['mts', 'cts', 'ts']) {
        writeFileSync(join(recordOnly, `record-types.${extension}`), source);
      }
      checkTypes(recordOnly, 'record-types', consumer);
    });
    // A mounted browser host necessarily installs ReactDOM; never conflate it
    // with the independent React-version-specific isolation check above.
    recordConsumer = join(evidence, 'record-browser');
    await step('explicit separate record browser host install', () => install(recordConsumer, {
      'footprint-explainable-ui': `file:${flow.path}`, foottrace: cohort.pins.foottrace,
      react: lane.peers.react, 'react-dom': lane.peers['react-dom'],
      ...lane.types, vite: tooling.vite, playwright: tooling.playwright,
    }, 'record-browser'));
    assertInstalled(join(recordConsumer, 'node_modules/footprint-explainable-ui'), flow.files, 'record browser Flow');
    verifyRecordOwner(recordConsumer);
  }
  if (lane.kind === 'native' && flags.browser !== 'no') {
    let browserEnvironment;
    if (flags['install-browser'] === 'yes') await step('provision the declared browser for this CI lane', async () => {
      const receipt = await installBrowser({ consumer, evidence, strategy: browserStrategy });
      if (browserStrategy === 'bundled') browserEnvironment = {
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: receipt.executablePath,
        PLAYWRIGHT_CHROMIUM_EXPECTED_VERSION: receipt.browserVersion,
      };
    });
    await step('actual installed-package browser replay, cursor, theme and saved records', () => {
      const args = [join(root, 'scripts/check-compat-browser.mjs'), '--consumer', consumer,
        '--evidence', join(evidence, 'browser'), '--lane', lane.id, '--flow-version', flow.version,
        '--archive-proof', join(evidence, 'archive-proof.json')];
      if (recordConsumer) args.push('--record-consumer', recordConsumer, '--record-fixtures', readRecordFixtures());
      command(process.execPath, args, { cwd: consumer, env: browserEnvironment, log: join(evidence, 'browser.log'), timeout: 180_000 });
    });
  }
  await step('all installed bytes and archives still equal after every probe', () => {
    verifyBytes();
    if (recordConsumer) assertInstalled(join(recordConsumer, 'node_modules/footprint-explainable-ui'), flow.files, 'record browser Flow');
    if (recordOnly) {
      verifyRecordOwner(recordOnly);
      assertInstalled(join(recordOnly, 'node_modules/footprint-explainable-ui'), flow.files, 'record-only Flow');
      assertRecordIsolation(installedPackageNames(join(recordOnly, 'node_modules')), lane.react);
      verifyRecordOwner(recordOnly);
    }
    if (recordConsumer) verifyRecordOwner(recordConsumer);
  });
  report.status = flags.browser === 'no' && lane.kind === 'native' ? 'diagnostic-without-browser' : 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack;
  throw error;
} finally {
  writeJson(join(evidence, 'verification.json'), report);
  console.log(`Compatibility evidence retained: ${evidence}`);
}
