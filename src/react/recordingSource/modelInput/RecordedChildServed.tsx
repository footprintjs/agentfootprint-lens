import React, { useEffect, useState } from 'react';
import type { CursorPosition } from '../../../core/group/cursorPositionsAtDrill.js';
import type { LensRecordingSource } from '../types.js';
import { ContextServedTab } from '../../components/ServedTab.js';
import type { ServedGraphInput } from '../../../core/served/index.js';
import { T } from '../../theme/index.js';

type Read = NonNullable<LensRecordingSource['readModelInputAt']>;

export function RecordedChildServed({ read, invocationPath, stop }: {
  readonly read?: Read | undefined;
  readonly invocationPath: readonly string[];
  readonly stop: Pick<CursorPosition, 'runtimeStageId' | 'commitIdx' | 'kind'> | undefined;
}): React.ReactElement {
  const key = JSON.stringify([invocationPath, stop?.runtimeStageId, stop?.commitIdx]);
  const [loaded, setLoaded] = useState<{ read: Read; key: string; reading: ServedGraphInput | undefined }>();
  useEffect(() => {
    if (!read || !stop || stop.kind !== 'commit') return;
    const abort = new AbortController();
    void read({ drillPath: invocationPath, runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx },
      { signal: abort.signal }).then(
      reading => { if (!abort.signal.aborted) setLoaded({ read, key, reading }); },
      () => { if (!abort.signal.aborted) setLoaded({ read, key, reading: undefined }); },
    );
    return () => abort.abort();
  }, [read, key, invocationPath, stop]);

  const current = loaded?.read === read && loaded?.key === key ? loaded : undefined;
  if (current?.reading && stop) return <ContextServedTab snapshot={undefined} at={stop} reading={current.reading} />;
  return <p role="status" style={{ padding: 16, color: T.textSecondary }}>
    {read && stop?.kind === 'commit' && current === undefined
      ? 'Reading model input…'
      : 'Model-input inspection is unavailable for this recorded child scope.'}
  </p>;
}
