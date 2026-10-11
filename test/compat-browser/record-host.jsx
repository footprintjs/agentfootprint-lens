import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecordLens, buildRecordLensModel } from 'footprint-explainable-ui/record';
import { keysReadFromMap } from 'foottrace';
import flow from './flow.json';
import hci from './hci.json';

const sources = { flow: flow.root, child: flow.child, hci };
function Host() {
  const [sourceName, setSourceName] = useState('flow');
  const [step, setStep] = useState(2);
  const [selectedKey, setSelectedKey] = useState('net');
  const source = sources[sourceName];
  const reads = { ...keysReadFromMap(source.reads.byStep), ...(source.reads.coverage ? { coverage: source.reads.coverage } : {}) };
  const input = { sourceId: source.sourceId, source: source.source, reads, step, selectedKey };
  const select = (name, position, key) => { setSourceName(name); setStep(position); setSelectedKey(key); };
  return <main>
    <h1>Installed record-only viewer</h1>
    <nav aria-label="Recording selection">
      <button onClick={() => select('flow', 2, 'net')}>Flow recording</button>
      <button onClick={() => select('child', 1, 'approved')}>Child recording</button>
      <button onClick={() => select('hci', 5, 'orderId')}>HCI recording</button>
    </nav>
    <output data-testid="record-model" style={{ display: 'none' }}>{JSON.stringify(buildRecordLensModel(input))}</output>
    <RecordLens {...input} onStepChange={setStep} onKeyChange={setSelectedKey} />
  </main>;
}

createRoot(document.getElementById('root')).render(<Host />);
