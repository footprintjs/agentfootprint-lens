import React, { useEffect, useState } from 'react';
import { openContextRecording, type ContextOpening } from '../core/contextOpening.js';
import type { RecordingVerdict } from '../core/recordingInput.js';

/** Async adapter for the context feature chart; legacy recordings do not pass here. */
export function ContextRecordingGate({ recording, children }: {
  readonly recording: unknown;
  readonly children: (verdict: RecordingVerdict) => React.ReactElement;
}): React.ReactElement {
  const [opened, setOpened] = useState<{ input: unknown; result: ContextOpening }>();
  useEffect(() => {
    let current = true;
    void openContextRecording(recording).then(result => {
      if (current) setOpened({ input: recording, result });
    }, () => {
      if (current) setOpened({ input: recording, result: {
        verdict: { ok: false, received: 'a context recording this read could not open safely', goTo: 'record-the-run' },
        trace: { state: { disposition: 'refused' }, executionTree: null, commitLog: [] },
      } });
    });
    return () => { current = false; };
  }, [recording]);
  return opened !== undefined && opened.input === recording
    ? children(opened.result.verdict)
    : <div role="status">Opening recorded context…</div>;
}
