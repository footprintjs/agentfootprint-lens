// One isolated, retained consumer. Node selection belongs to the caller/CI;
// this runner checks it, never substitutes a different interpreter on failure.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInstalled, assertRecordIsolation, candidate, installedPackageNames,
  laneContract, parseFlags, sha256, tooling } from './contract.mjs';
import { command, inspectArchive, writeJson } from './process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const flags = parseFlags(process.argv.slice(2),
  ['kind', 'flow', 'react', 'node', 'artifacts', 'evidence', 'flow-source', 'browser', 'install-browser']);
const lane = laneContract(flags);
assert.equal(process.versions.node.split('.')[0], lane.node, 'run this lane with its declared Node major');
assert.ok(flags.artifacts && flags.evidence, '--artifacts and --evidence are required');
const artifacts = resolve(flags.artifacts);
const evidence = resolve(flags.evidence);
mkdirSync(dirname(evidence), { recursive: true });
mkdirSync(evidence); // A repeated run must not overwrite an earlier failure's evidence.
const report = { schema: 1, lane, node: process.version, npm: command('npm', ['--version']).trim(),
  status: 'running', steps: [], packages: {} };
writeJson(join(evidence, 'verification.json'), report);

function step(name, run) {
  run(); report.steps.push(name); writeJson(join(evidence, 'verification.json'), report);
}
function install(directory, dependencies, label) {
  mkdirSync(directory); // Never reuse a consumer with unknown installed state.
  writeJson(join(directory, 'package.json'), { name: `lens-${label}`, version: '1.0.0', private: true, dependencies });
  command('npm', ['install', '--strict-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: directory, log: join(evidence, `${label}-install.log`) });
  command('npm', ['ls', '--all', '--json'], { cwd: directory, log: join(evidence, `${label}-tree.json`) });
}
function checkTypes(consumer, stem, toolConsumer = consumer) {
  const tsc = join(toolConsumer, 'node_modules/typescript/bin/tsc');
  const common = ['--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--types', 'react', '--lib', 'ES2022,DOM,DOM.Iterable'];
  for (const [mode, extension, resolution, module] of [
    ['nodenext-esm', 'mts', 'NodeNext', 'NodeNext'],
    ['nodenext-cjs', 'cts', 'NodeNext', 'NodeNext'],
    ['bundler', 'ts', 'Bundler', 'ESNext'],
  ]) {
    command(process.execPath, [tsc, ...common, '--module', module, '--moduleResolution', resolution, `${stem}.${extension}`],
      { cwd: consumer, log: join(evidence, `${dirname(consumer) === evidence ? consumer.split('/').at(-1) : 'types'}-${mode}.log`) });
  }
}

try {
  const contract = JSON.parse(readFileSync(join(artifacts, 'contract.json'), 'utf8'));
  assert.equal(contract.schema, 1);
  assert.deepEqual(contract.candidate, candidate);
  if (process.env.GITHUB_RUN_ID) {
    assert.equal(contract.source.workflowRun, process.env.GITHUB_RUN_ID,
      'Why artifact must come from this workflow, not a prior build');
    assert.equal(contract.source.workflowAttempt, process.env.GITHUB_RUN_ATTEMPT);
    assert.equal(contract.source.whyCommit, process.env.GITHUB_SHA, 'Why archive source does not match this checked commit');
  }
  assert.equal(contract.why.path, 'agentfootprint-lens-0.76.0.tgz');
  assert.equal(contract.flow.path, 'footprint-explainable-ui-1.0.0.tgz');
  const why = inspectArchive(join(artifacts, contract.why.path), evidence,
    { name: 'agentfootprint-lens', version: '0.76.0', expectedSha: contract.why.sha256 });
  assert.deepEqual(why.files, contract.why.files);
  report.packages.why = { sha256: why.sha256, files: why.files, source: contract.source };
  let flow;
  if (lane.flow === 'candidate') {
    flow = inspectArchive(join(artifacts, contract.flow.path), evidence,
      { name: 'footprint-explainable-ui', version: '1.0.0', expectedSha: candidate.sha256 });
    assert.deepEqual(flow.files, contract.flow.files);
  } else {
    const packed = JSON.parse(command('npm', ['pack', `footprint-explainable-ui@${lane.flow}`, '--ignore-scripts',
      '--json', '--pack-destination', evidence], { cwd: evidence, log: join(evidence, 'published-flow-pack.log') }));
    assert.equal(packed.length, 1);
    flow = inspectArchive(join(evidence, packed[0].filename), evidence,
      { name: 'footprint-explainable-ui', version: lane.flow });
  }
  report.packages.flow = { sha256: flow.sha256, files: flow.files };
  writeJson(join(evidence, 'archive-proof.json'), { ...report.packages, candidate: lane.flow === 'candidate' ? candidate : null });
  const consumer = join(evidence, 'consumer');
  step('strict fresh peer install', () => install(consumer, {
    ...lane.peers, ...lane.types, ...tooling,
    'agentfootprint-lens': `file:${why.path}`, 'footprint-explainable-ui': `file:${flow.path}`,
  }, 'consumer'));
  const whyInstalled = join(consumer, 'node_modules/agentfootprint-lens');
  const flowInstalled = join(consumer, 'node_modules/footprint-explainable-ui');
  function verifyBytes() {
    assertInstalled(whyInstalled, why.files, 'Why');
    assertInstalled(flowInstalled, flow.files, 'Flow');
    assert.equal(sha256(readFileSync(why.path)), why.sha256, 'Why archive changed during checks');
    assert.equal(sha256(readFileSync(flow.path)), flow.sha256, 'Flow archive changed during checks');
  }
  step('all installed bytes equal the archives before probes', verifyBytes);
  step('all five ESM/CJS doors, native old-peer fallback, canonical owner, replay and SSR', () => {
    copyFileSync(join(root, 'scripts/check-packed-peers.mjs'), join(consumer, 'check-packed-peers.mjs'));
    command(process.execPath, ['check-packed-peers.mjs'], { cwd: consumer, log: join(evidence, 'runtime.log') });
  });
  step('strict NodeNext ESM/CJS and Bundler declarations, with negative controls', () => {
    for (const extension of ['mts', 'cts', 'ts']) copyFileSync(join(root, 'scripts/check-packed-peer-types.ts'),
      join(consumer, `check-packed-peer-types.${extension}`));
    checkTypes(consumer, 'check-packed-peer-types');
  });

  let recordConsumer;
  let recordOnly;
  if (lane.flow === 'candidate') {
    assert.ok(flags['flow-source'], 'candidate lanes need --flow-source for immutable recorded fixtures');
    assert.equal(command('git', ['rev-parse', 'HEAD'], { cwd: flags['flow-source'] }).trim(), candidate.commit);
    recordOnly = join(evidence, 'record-only');
    step('separate normal record-only install has no engines or graph peers', () => {
      install(recordOnly, {
        'footprint-explainable-ui': `file:${flow.path}`, foottrace: '1.0.3', react: lane.peers.react,
        '@types/react': lane.types['@types/react'],
      }, 'record-only');
      const packages = installedPackageNames(join(recordOnly, 'node_modules'));
      assertRecordIsolation(packages, lane.react);
      report.recordOnly = { packages };
      assertInstalled(join(recordOnly, 'node_modules/footprint-explainable-ui'), flow.files, 'record-only Flow');
    });
    step('record-only ESM/CJS public viewer and literal saved-record expectations', () => {
      const fixtures = join(resolve(flags['flow-source']), 'pilots/record-lens');
      for (const filename of ['flow.json', 'hci.json']) {
        const path = join(fixtures, 'fixtures', filename);
        const expected = filename === 'flow.json'
          ? '6220e9422696028c8ad6f4243bc1c3caa33152a62ca6dcbdf54a17c5bd0259b1'
          : 'fc287b4e0c4e955e2d0ec6b1145971e020e829238e0e77bdd0e39d0f614ceee8';
        assert.equal(sha256(readFileSync(path)), expected, `immutable ${filename} changed`);
        copyFileSync(path, join(recordOnly, filename));
      }
      const runtimeFile = 'pilots/record-lens/runtime-fixtures.cjs';
      assert.equal(readFileSync(join(flags['flow-source'], runtimeFile), 'utf8'),
        command('git', ['show', `${candidate.commit}:${runtimeFile}`], { cwd: flags['flow-source'] }),
        'reuse the exact reviewed M6 saved-record expectations, not an edited substitute');
      copyFileSync(join(flags['flow-source'], runtimeFile), join(recordOnly, 'runtime-fixtures.cjs'));
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
    step('record-only public declarations under all strict resolutions', () => {
      const source = "import { RecordLens } from 'footprint-explainable-ui/record';\nexport const Viewer = RecordLens;\n";
      for (const extension of ['mts', 'cts', 'ts']) {
        writeFileSync(join(recordOnly, `record-types.${extension}`), source);
      }
      checkTypes(recordOnly, 'record-types', consumer);
    });
    // A mounted browser host necessarily installs ReactDOM; never conflate it
    // with the independent React-version-specific isolation check above.
    recordConsumer = join(evidence, 'record-browser');
    step('explicit separate record browser host install', () => install(recordConsumer, {
      'footprint-explainable-ui': `file:${flow.path}`, foottrace: '1.0.3',
      react: lane.peers.react, 'react-dom': lane.peers['react-dom'],
      ...lane.types, vite: tooling.vite, playwright: tooling.playwright,
    }, 'record-browser'));
    assertInstalled(join(recordConsumer, 'node_modules/footprint-explainable-ui'), flow.files, 'record browser Flow');
  }
  if (lane.kind === 'modern' && flags.browser !== 'no') {
    if (flags['install-browser'] === 'yes') step('install the declared browser for this CI lane', () => {
      command(process.execPath, [join(consumer, 'node_modules/playwright/cli.js'), 'install', '--with-deps', 'chromium'],
        { cwd: consumer, log: join(evidence, 'browser-install.log') });
    });
    step('actual installed-package browser replay, cursor, theme and candidate records', () => {
      const args = [join(root, 'scripts/check-compat-browser.mjs'), '--consumer', consumer,
        '--evidence', join(evidence, 'browser'), '--lane', lane.id, '--flow-version', flow.version,
        '--archive-proof', join(evidence, 'archive-proof.json')];
      if (recordConsumer) args.push('--record-consumer', recordConsumer, '--record-fixtures',
        join(resolve(flags['flow-source']), 'pilots/record-lens/fixtures'));
      command(process.execPath, args, { cwd: consumer, log: join(evidence, 'browser.log'), timeout: 180_000 });
    });
  }
  step('all installed bytes and archives still equal after every probe', () => {
    verifyBytes();
    if (recordConsumer) assertInstalled(join(recordConsumer, 'node_modules/footprint-explainable-ui'), flow.files, 'record browser Flow');
    if (recordOnly) {
      assertInstalled(join(recordOnly, 'node_modules/footprint-explainable-ui'), flow.files, 'record-only Flow');
      assertRecordIsolation(installedPackageNames(join(recordOnly, 'node_modules')), lane.react);
    }
  });
  report.status = flags.browser === 'no' && lane.kind === 'modern' ? 'diagnostic-without-browser' : 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack;
  throw error;
} finally {
  writeJson(join(evidence, 'verification.json'), report);
  console.log(`Compatibility evidence retained: ${evidence}`);
}
