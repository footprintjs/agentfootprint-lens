/**
 * <CrossSubflowChip> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrossSubflowChip } from './CrossSubflowChip.js';

describe('<CrossSubflowChip>', () => {
  it('renders writer label as `${dir}/${stage#N}`', () => {
    render(
      <CrossSubflowChip
        writerRuntimeStageId="sf-tools/call-llm#5"
        writerSubflowPath={['__root__', 'sf-tools', 'sf-inner']}
      />,
    );
    // dir = __root__ stripped + 'sf-tools' (path slice(0,-1) of stripped) → 'sf-tools'
    expect(screen.getByText(/written by sf-tools\/call-llm#5/)).toBeTruthy();
  });

  it('falls back to just stage#N when path is shallow', () => {
    render(
      <CrossSubflowChip
        writerRuntimeStageId="x#0"
        writerSubflowPath={['__root__', 'sf-a']}
      />,
    );
    // stripped = ['sf-a'], dir = [] → ''
    expect(screen.getByText(/written by x#0/)).toBeTruthy();
  });

  it('click fires onFocus with writer runtimeStageId', () => {
    const onFocus = vi.fn();
    render(
      <CrossSubflowChip
        writerRuntimeStageId="x#0"
        writerSubflowPath={['__root__']}
        onFocus={onFocus}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onFocus).toHaveBeenCalledWith('x#0');
  });

  it('clickable without onFocus (no throw)', () => {
    render(<CrossSubflowChip writerRuntimeStageId="x#0" writerSubflowPath={['__root__']} />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });

  it('data-rid attribute carries the runtime id', () => {
    render(<CrossSubflowChip writerRuntimeStageId="x#0" writerSubflowPath={['__root__']} />);
    expect(screen.getByRole('button').getAttribute('data-rid')).toBe('x#0');
  });
});
