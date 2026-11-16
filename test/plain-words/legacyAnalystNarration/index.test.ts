import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES, load } from '../../served/helpers.js';
import { legacyAnalystNarration } from './index.js';

describe('fixed historical analyst narration', () => {
  it('keeps the original recording bytes paired with the historical layout oracle', () => {
    const bytes = readFileSync(join(FIXTURES, 'flat-dynamic-tools.json'));
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('3bceee8ed8f675f81f9f6257e72e1f308cfe830a2d4bc635c953946eef9af832');
  });

  it('explicitly covers every recorded identity with exactly the nine original caption inputs', () => {
    const events = load('flat-dynamic-tools').recording.events!;
    expect(events.length).toBeGreaterThan(0);
    const captions = events.map(legacyAnalystNarration);
    expect(captions.filter((line) => line !== null)).toHaveLength(9);
  });

  it('refuses an unrecognized fixture event instead of borrowing current default policy', () => {
    const event = load('flat-dynamic-tools').recording.events![0]!;
    expect(() => legacyAnalystNarration({ ...event, meta: { ...event.meta, runtimeStageId: 'another-stage#0' } }))
      .toThrow('Unexpected event in the historical analyst layout fixture');
  });
});
