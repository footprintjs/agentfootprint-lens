/**
 * A 9.88 peer: agentfootprint exports `receiptHash` and `messageDigestInput`
 * but not `toolDigestInput` (it arrived in 9.89.0). Under that peer the
 * schema rows must read EXACTLY as 0.47.0 read them — `'reconstructed'`, the
 * receipt's hash as data, no rebuilt hash — and nothing may fail at module
 * load: `verify.ts` reads the symbol off the module namespace at call time,
 * never as a named import (which ESM would refuse to link). A mock cannot
 * pin the link-time property (vitest rewrites named imports into property
 * reads), so the last test reads verify.ts and asserts the named list from
 * 'agentfootprint' does not carry `toolDigestInput`.
 *
 * Test type: compatibility (feature-detected, pinned with a mock of the one
 * missing export; every other export is the real 9.89.0).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { receiptAt } from 'agentfootprint';

import { servedRowAt, verify } from '../../src/core/served/index.js';
import { load, stopsOf } from './helpers.js';

vi.mock('agentfootprint', async (importOriginal) => {
  const actual = await importOriginal<typeof import('agentfootprint')>();
  return { ...actual, toolDigestInput: undefined };
});

describe('verify under a peer without toolDigestInput (agentfootprint 9.88)', () => {
  it('schema rows stay reconstructed with the receipt hash as data; every other row reads as on 9.89', () => {
    const f = load('flat-dynamic-tools');
    for (const stop of stopsOf(f, 'llm-turn')) {
      const row = servedRowAt(f.snapshot, { runtimeStageId: stop.runtimeStageId, commitIdx: stop.commitIdx })!;
      const receipt = receiptAt(f.snapshot, row.epoch)!;
      const checks = verify(row.view, receipt, receipt.basis.runId);
      expect(row.view.tools.schemas.length).toBeGreaterThan(0);
      for (const s of row.view.tools.schemas) {
        expect(checks.toolSchemas[s.name]).toEqual({
          status: 'reconstructed',
          onReceipt: receipt.tools.schemaHashes[s.name],
        });
        expect(checks.toolSchemas[s.name]!.rebuilt).toBeUndefined();
      }
      // The rows the 9.88 peer CAN hash are unaffected.
      expect(checks.system.status).toBe('verified');
      checks.pieces.forEach((c) => expect(c.status).toBe('verified'));
      checks.messages.forEach((c) => expect(c.status).toBe('verified'));
      // Name pairing needs no digest, so the counts are still data.
      expect(checks.onReceiptOnly.schemas).toEqual([]);
      expect(checks.rebuiltOnly.schemas).toEqual([]);
      expect(checks.damaged).toBe(false);
    }
  });
});

describe('the symbol is read off the namespace, not named-imported', () => {
  it("verify.ts's named import list from 'agentfootprint' does not carry toolDigestInput", () => {
    const src = readFileSync(join(process.cwd(), 'src/core/served/verify.ts'), 'utf8');
    const named = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'agentfootprint'/g)].map((m) => m[1]).join(',');
    expect(named).not.toMatch(/\btoolDigestInput\b/);
    expect(src).toMatch(/import \* as agentfootprint from 'agentfootprint'/);
  });
});
