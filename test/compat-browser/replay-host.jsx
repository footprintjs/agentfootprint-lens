import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Lens, Replay } from 'agentfootprint-lens';
import { observeRecording } from 'agentfootprint-lens/core';
import fixture from './tagged-chart.json';

// The original saved recording is copied byte-for-byte by the proof runner.
// Both public entry paths replay it; no live runner or model is constructed.
function Host() {
  const [mode, setMode] = useState('light');
  const [entry, setEntry] = useState('replay');
  const observed = useMemo(() => observeRecording(fixture), []);
  const theme = { mode, current: mode === 'light' ? '#d24677' : '#12ab34' };
  return <main>
    <h1>Installed Why Lens compatibility</h1>
    <nav aria-label="Compatibility host">
      <button onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}>Change theme</button>
      <button onClick={() => setEntry(entry === 'replay' ? 'observed' : 'replay')}>Change public entry</button>
      <output data-testid="host-mode">{entry}:{mode}</output>
    </nav>
    <output data-testid="recorded-commits" style={{ display: 'none' }}>
      {JSON.stringify(observed.recorder.getCommitLog())}
    </output>
    <section style={{ height: 820, width: '100%', minWidth: 0 }}>
      {entry === 'replay'
        ? <Replay trace={fixture} theme={theme} />
        : <Lens recorder={observed.recorder} runner={observed.runner} theme={theme} view="engineer" />}
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<Host />);
