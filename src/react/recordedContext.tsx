import React, { createContext, useContext } from 'react';
import type { RecordedContextView } from '../core/recordedContext.js';
import { RecordedContextPanel } from './recordedContext/Panel.js';
import { lensThemeVars, type LensTheme } from './theme/index.js';

const Context = /* @__PURE__ */ createContext<RecordedContextView | undefined>(undefined);

/** One immutable model for this recording's view and its copied text. */
export function RecordedContextScope({ view, children, showPanel = true, theme }: {
  readonly view: RecordedContextView | undefined;
  readonly children: React.ReactNode;
  readonly showPanel?: boolean;
  readonly theme?: LensTheme;
}): React.ReactElement {
  return <Context.Provider value={view}>
    {view === undefined ? children : <div style={{ ...lensThemeVars(theme), display: 'contents' }}>
      {showPanel && <RecordedContextPanel view={view} />}
      {children}
    </div>}
  </Context.Provider>;
}

export function useRecordedContext(): RecordedContextView | undefined {
  return useContext(Context);
}
