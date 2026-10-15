/** @vitest-environment node */
/**
 * The locator the packaging tests use to find agentfootprint modules by what
 * they define. Its refusal is what keeps their absence checks from passing
 * vacuously when agentfootprint moves a folder, so the refusal is pinned here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { familyOf, isIn, moduleDefining } from './agentfootprintModules.js';

describe('agentfootprint modules, located by what they define', () => {
  it('finds the one module that declares the symbol (re-exports are not declarations)', () => {
    const build = moduleDefining('describeBugReport');
    expect(readFileSync(build, 'utf8')).toMatch(/^export function describeBugReport\(/m);
  });

  it("a family is the anchor module's folder, and holds that module", () => {
    const family = familyOf('describeBugReport');
    expect(family.folder.endsWith('/')).toBe(true);
    expect(family.modules).toContain(moduleDefining('describeBugReport'));
    expect(family.modules.every((path) => isIn(path, family.folder))).toBe(true);
  });

  it('refuses a symbol no module defines: an anchor out of reach fails, never passes vacuously', () => {
    expect(() => moduleDefining('noAgentfootprintModuleDefinesThis')).toThrow(/found 0/);
    expect(() => familyOf('noAgentfootprintModuleDefinesThis')).toThrow(/found 0/);
  });
});
