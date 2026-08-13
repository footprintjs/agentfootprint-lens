/** @vitest-environment jsdom */
/**
 * The component registry — the no-eval law's bookkeeping.
 *
 * Pinned: kinds resolve to registered components; the shipped 'dataset/rows'
 * table answers when nothing is registered; a registration OVERRIDES the
 * built-in and its unregister function restores it; an unknown kind resolves
 * to undefined (the pane then renders the honest card); malformed
 * registrations are refused with a teaching sentence, never accepted and
 * silently wrong.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { ArtifactRowsTable } from './ArtifactRowsTable.js';
import {
  artifactComponentFor,
  registerArtifactComponent,
  type ArtifactComponentProps,
} from './registry.js';

const Custom: React.FC<ArtifactComponentProps> = () => <div>custom</div>;

describe('registerArtifactComponent / artifactComponentFor', () => {
  it('resolves a registered component by exact kind', () => {
    const unregister = registerArtifactComponent({ kind: 'chart/spec', component: Custom });
    try {
      expect(artifactComponentFor('chart/spec')).toBe(Custom);
    } finally {
      unregister();
    }
    expect(artifactComponentFor('chart/spec')).toBeUndefined();
  });

  it("ships 'dataset/rows' → ArtifactRowsTable as a built-in, overridable by registration", () => {
    expect(artifactComponentFor('dataset/rows')).toBe(ArtifactRowsTable);
    const unregister = registerArtifactComponent({ kind: 'dataset/rows', component: Custom });
    try {
      expect(artifactComponentFor('dataset/rows')).toBe(Custom);
    } finally {
      unregister();
    }
    expect(artifactComponentFor('dataset/rows')).toBe(ArtifactRowsTable);
  });

  it('resolves an unknown kind to undefined — the pane states the gap and falls back', () => {
    expect(artifactComponentFor('mystery/blob')).toBeUndefined();
  });

  it('unregister removes only its own registration, never a later replacement', () => {
    const first = registerArtifactComponent({ kind: 'x/y', component: Custom });
    const Replacement: React.FC<ArtifactComponentProps> = () => <div>replacement</div>;
    const second = registerArtifactComponent({ kind: 'x/y', component: Replacement });
    first(); // stale unregister — must not remove the replacement
    expect(artifactComponentFor('x/y')).toBe(Replacement);
    second();
    expect(artifactComponentFor('x/y')).toBeUndefined();
  });

  it('refuses a blank kind and a non-component, teaching what each must be', () => {
    expect(() => registerArtifactComponent({ kind: '  ', component: Custom })).toThrow(
      /needs `kind`/,
    );
    expect(() =>
      registerArtifactComponent({ kind: 'chart/spec', component: null as never }),
    ).toThrow(/needs `component`/);
  });
});
