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
  'agentfootprint-lens/core': ['LensRecorder', 'observeRecording'],
  'agentfootprint-lens/why': ['WhyLens'],
  'agentfootprint-lens/skillgraph': ['SkillGraphDebugger'],
  'agentfootprint-lens/context': ['ContextView'],
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
  console.log(`${format}: all packed entry points, renderer exports, replay overlay and React render passed`);
}
