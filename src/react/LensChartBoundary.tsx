/**
 * LensChartBoundary — a small error boundary around the chart renderer.
 *
 * A malformed `chart` prop (or an internal render error in the flow graph)
 * should NOT white-screen the whole Lens. This catches the error and shows a
 * compact fallback while the rest of the monitor (timeline, commentary,
 * details) keeps working.
 */

import React from 'react';

interface Props {
  readonly children: React.ReactNode;
  readonly fallback?: React.ReactNode;
}
interface State {
  readonly error: Error | null;
}

export class LensChartBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div style={{ padding: 24, color: '#b45309', fontSize: 12, lineHeight: 1.5 }}>
            The composition chart couldn’t render ({this.state.error.message}). The
            rest of the monitor (timeline, commentary, details) is unaffected.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
