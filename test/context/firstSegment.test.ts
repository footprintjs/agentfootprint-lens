import { describe, expect, it } from 'vitest';

import { firstSegment } from '../../src/core/context/contextAt.js';

describe('firstSegment — the top-level key a trace-row path names', () => {
  it('a nested path names its root key; a dotted key name stays ONE key', () => {
    expect(firstSegment('order\u001Flines\u001F0')).toBe('order');
    expect(firstSegment('order.lines.0')).toBe('order.lines.0');
    expect(firstSegment('order')).toBe('order');
  });
});
