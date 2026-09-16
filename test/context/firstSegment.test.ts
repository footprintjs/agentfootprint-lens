import { describe, expect, it, vi } from 'vitest';

describe('firstSegment — the top-level key of a trace-row path, on every substrate', () => {
  it('on a substrate that exports pathSegments (9.22.0+), that helper decides', async () => {
    const trace = await import('footprintjs/trace');
    const { firstSegment } = await import('../../src/core/context/contextAt.js');
    const helper = (trace as { pathSegments?: (p: string) => string[] }).pathSegments;
    expect(typeof helper).toBe('function');
    expect(firstSegment('order\u001Flines\u001F0')).toBe('order');
    // A dotted name is ONE key on this substrate — whatever the helper says, we say.
    expect(firstSegment('order.lines.0')).toBe(helper!('order.lines.0')[0]);
    expect(firstSegment('order')).toBe('order');
  });

  it('on the 9.17 floor (no pathSegments) the dotted path is split — the split that substrate used', async () => {
    vi.resetModules();
    vi.doMock('footprintjs/trace', async () => {
      const real = await vi.importActual<Record<string, unknown>>('footprintjs/trace');
      // The floor has no such export: the namespace property is simply undefined
      // (vitest throws on a name a mock omits, so it is spelled out).
      return { ...real, pathSegments: undefined };
    });
    const { firstSegment } = await import('../../src/core/context/contextAt.js');
    expect(firstSegment('order.lines.0')).toBe('order');
    expect(firstSegment('order\u001Flines')).toBe('order');
    expect(firstSegment('order')).toBe('order');
    vi.doUnmock('footprintjs/trace');
    vi.resetModules();
  });
});
