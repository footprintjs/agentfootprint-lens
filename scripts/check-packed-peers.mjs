// Copy this file into the isolated consumer after installing the packed Lens.
// Its imports must resolve there, never against the repository's devDependencies.
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';

// Node has no CSS loader. Ignore only stylesheets, for both module formats;
// missing exports and every other loading/runtime error must fail this check.
register(`data:text/javascript,${encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', source: '', shortCircuit: true };
    }
    return nextLoad(url, context);
  }
`)}`);
const require = createRequire(import.meta.url);
require.extensions['.css'] = () => {};

const surfaces = {
  'agentfootprint-lens': ['Lens', 'Replay', 'observeRecording'],
  'agentfootprint-lens/core': ['LensRecorder', 'observeRecording', 'buildGroups'],
  'agentfootprint-lens/why': ['WhyLens'],
  'agentfootprint-lens/skillgraph': ['SkillGraphDebugger'],
  'agentfootprint-lens/context': ['ContextView'],
  'agentfootprint/observe': ['BoundaryRecorder'],
  'footprintjs/trace': ['CommitRangeIndex'],
  // Every renderer value imported by Lens. ESM also checks named imports in
  // the packed JS, so adding a new unavailable import fails without this list.
  'footprint-explainable-ui': ['coolDark', 'coolLight', 'tokensToCSSVars'],
  'footprint-explainable-ui/flowchart': [
    'GroupContainerNode', 'SlotPillNode', 'StageNode', 'TracedFlow',
    'collapseTraceGraph', 'createTraceRuntimeOverlay',
    'createTraceStructureRecorder', 'overlayFromSnapshot',
  ],
};

const snapshot = {
  commitLog: [
    { idx: 0, runtimeStageId: 'read#0', stage: 'Read' },
    { idx: 1, runtimeStageId: 'answer#1', stage: 'Answer' },
  ],
};
const structure = {
  id: 'read', name: 'Read', type: 'stage',
  next: { id: 'answer', name: 'Answer', type: 'stage' },
};

for (const [format, load] of [
  ['ESM', (specifier) => import(specifier)],
  ['CJS', (specifier) => require(specifier)],
]) {
  const modules = {};
  for (const [specifier, names] of Object.entries(surfaces)) {
    const loaded = await load(specifier);
    for (const name of names) {
      assert.notEqual(loaded[name], undefined, `${format}: ${specifier} must export ${name}`);
    }
    modules[specifier] = loaded;
  }

  // AgentFootprint 9 creates a FootPrint index; AgentFootprint 10 creates a
  // Foottrace index. The published reader must accept both, including a
  // query-only view, without depending on either class's constructor identity.
  const { BoundaryRecorder } = modules['agentfootprint/observe'];
  const { CommitRangeIndex } = modules['footprintjs/trace'];
  const { buildGroups } = modules['agentfootprint-lens/core'];
  for (const [owner, index] of [
    ['AgentFootprint', new BoundaryRecorder().boundaryIndex],
    ['FootPrint', new CommitRangeIndex()],
  ]) {
    index.open({
      type: 'run.entry', runtimeStageId: '__root__#0', subflowPath: [], depth: 0, ts: 0,
    }, 0);
    const child = index.open({
      type: 'subflow.entry', runtimeStageId: 'work#1', subflowPath: ['work'],
      subflowId: 'work', subflowName: 'Work', depth: 1, ts: 1,
    }, 2);
    index.close(child, 5);
    const groups = buildGroups(index);
    assert.deepEqual(
      groups.map((group) => [group.runtimeGroupId, group.parentGroupId, group.closesAtCommitIdx]),
      [['__root__#0', undefined, undefined], ['work#1', '__root__#0', 5]],
      `${format}: the public group reader accepts ${owner}'s real boundary index`,
    );
    assert.deepEqual(buildGroups({
      enclosing: index.enclosing.bind(index),
      overlapping: index.overlapping.bind(index),
    }), groups, `${format}: only boundary queries are required`);
    assert.equal(index.size, 2, `${format}: querying does not mutate ${owner}'s index`);
  }

  // Loading alone cannot catch a missing runtime handle method: replay must
  // actually seed the two recorded stages, or an older renderer stays unlit.
  const { recorder } = modules['agentfootprint-lens/core'].observeRecording({ snapshot, structure });
  try {
    assert.deepEqual(
      recorder.runtime.getOverlay().executionOrder.map((step) => step.runtimeStageId),
      ['read#0', 'answer#1'],
      `${format}: replay must restore the recorded execution overlay`,
    );
  } finally {
    recorder.detach();
  }

  // Render a recorded chart through the packed component and the consumer's
  // React/react-dom pair. Styles are the only browser resource this check skips.
  const React = await load('react');
  const { renderToStaticMarkup } = await load('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(modules['agentfootprint-lens'].Replay, {
    trace: { snapshot, structure, events: [] },
  }));
  assert.match(html, /lens-replay/);
  assert.match(html, /react-flow/);
  assert.doesNotMatch(html, /lens-replay--no-structure/);
  console.log(`${format}: all packed entry points, boundary queries, renderer exports, replay overlay and React render passed`);
}
