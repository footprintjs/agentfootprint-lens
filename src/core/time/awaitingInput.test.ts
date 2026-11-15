import { describe, expect, it } from 'vitest';
import { awaitingInputOf } from './awaitingInput.js';
describe('native awaiting request identity', () => {
  it('keeps the exact request across each supported pause home', () => {
    const request = { fields: [] };
    for (const value of [request, { awaitingInput: request }, { pauseData: { awaitingInput: request } }])
      expect(awaitingInputOf(value)).toBe(request);
  });
  it('does not invoke an accessor or loop through a cyclic wrapper', () => {
    let reads = 0;
    expect(awaitingInputOf({ get fields() { reads++; return []; } })).toBeUndefined();
    expect(reads).toBe(0);
    const cycle: { pauseData?: unknown } = {}; cycle.pauseData = cycle;
    expect(awaitingInputOf(cycle)).toBeUndefined();
  });
});
