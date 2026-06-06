/**
 * drillResolve — tests. Covers the chart-node → runtimeGroupId-chain
 * mapping and the selectHops subflowPath adapter.
 *
 * Patterns:
 *   P1 unit        — chain for a top-level subflow node
 *   P2 unit        — nested chain (parent walk, root excluded)
 *   P3 unit        — synth LLM card → LLMCall group
 *   P4 unit        — non-drillable (User node / unknown / root) → null
 *   P5 functional  — innerGroupSubflowPath adapts chain → subflowPath
 *   P6 property    — every returned chain ends at the clicked group, starts non-root
 *   P7 security    — cycle in parentGroupId doesn't hang
 */

import { describe, it, expect } from 'vitest';
import type { Group } from './Group.js';
import {
  resolveDrillChain,
  innerGroupSubflowPath,
  drillPathLabels,
} from './drillResolve.js';

function g(overrides: Partial<Group> & Pick<Group, 'runtimeGroupId' | 'subflowPath'>): Group {
  return {
    name: overrides.runtimeGroupId,
    parentGroupId: undefined,
    depth: overrides.subflowPath.length - 1,
    opensAtCommitIdx: 0,
    closesAtCommitIdx: undefined,
    isRoot: false,
    ...overrides,
  };
}

// A Parallel committee: root → sf-Committee → {legal, ethics}
const COMMITTEE: Group[] = [
  g({ runtimeGroupId: '__root__#0', subflowPath: ['__root__'], name: 'Run', isRoot: true }),
  g({ runtimeGroupId: 'sf-Committee#1', subflowPath: ['__root__', 'sf-Committee'], name: 'Committee', parentGroupId: '__root__#0', compositionKind: 'Parallel' }),
  g({ runtimeGroupId: 'legal#1', subflowPath: ['__root__', 'sf-Committee', 'legal'], name: 'legal', parentGroupId: 'sf-Committee#1', primitiveKind: 'Agent' }),
  g({ runtimeGroupId: 'ethics#3', subflowPath: ['__root__', 'sf-Committee', 'ethics'], name: 'ethics', parentGroupId: 'sf-Committee#1', primitiveKind: 'Agent' }),
];

describe('resolveDrillChain — P1 top-level subflow', () => {
  it('maps a top-level subflow node to a single-element chain', () => {
    expect(resolveDrillChain(COMMITTEE, 'sf-Committee')).toEqual(['sf-Committee#1']);
  });
});

describe('resolveDrillChain — P2 nested chain', () => {
  it('walks parentGroupId, excludes root, outermost→innermost', () => {
    expect(resolveDrillChain(COMMITTEE, 'legal')).toEqual(['sf-Committee#1', 'legal#1']);
  });
  it('handles a path-prefixed node id by matching the last segment', () => {
    expect(resolveDrillChain(COMMITTEE, 'sf-Committee/ethics')).toEqual(['sf-Committee#1', 'ethics#3']);
  });
});

describe('resolveDrillChain — P3 synth LLM card', () => {
  it('maps the synthesized atomic-LLMCall card to the LLMCall group', () => {
    const llm: Group[] = [
      g({ runtimeGroupId: '__root__#0', subflowPath: ['__root__'], isRoot: true }),
      g({ runtimeGroupId: 'sf-llm-call#1', subflowPath: ['__root__', 'sf-llm-call'], name: 'LLM', parentGroupId: '__root__#0', primitiveKind: 'LLMCall' }),
    ];
    expect(resolveDrillChain(llm, '__lens_llm_call_synth__')).toEqual(['sf-llm-call#1']);
  });
});

describe('resolveDrillChain — P4 non-drillable', () => {
  it('User node → null', () => {
    expect(resolveDrillChain(COMMITTEE, '__lens_user__')).toBeNull();
  });
  it('unknown id → null', () => {
    expect(resolveDrillChain(COMMITTEE, 'nope')).toBeNull();
  });
  it('empty id → null', () => {
    expect(resolveDrillChain(COMMITTEE, '')).toBeNull();
  });
});

describe('innerGroupSubflowPath — P5 selectHops adapter', () => {
  it('empty drillPath → []', () => {
    expect(innerGroupSubflowPath(COMMITTEE, [])).toEqual([]);
  });
  it('chain → innermost group subflowPath', () => {
    expect(innerGroupSubflowPath(COMMITTEE, ['sf-Committee#1', 'legal#1']))
      .toEqual(['__root__', 'sf-Committee', 'legal']);
  });
  it('unknown inner id → []', () => {
    expect(innerGroupSubflowPath(COMMITTEE, ['ghost#9'])).toEqual([]);
  });
});

describe('drillResolve — P6 property: chain integrity', () => {
  it('chain ends at clicked group and never includes root', () => {
    for (const node of ['sf-Committee', 'legal', 'ethics']) {
      const chain = resolveDrillChain(COMMITTEE, node)!;
      expect(chain).not.toContain('__root__#0');
      const last = chain[chain.length - 1];
      const grp = COMMITTEE.find((x) => x.runtimeGroupId === last)!;
      expect(grp.subflowPath[grp.subflowPath.length - 1]).toBe(node.split('/').pop());
    }
  });
});

describe('drillResolve — P7 security: cycle guard', () => {
  it('a parentGroupId cycle terminates instead of hanging', () => {
    const cyclic: Group[] = [
      g({ runtimeGroupId: 'a#1', subflowPath: ['__root__', 'a'], parentGroupId: 'b#1' }),
      g({ runtimeGroupId: 'b#1', subflowPath: ['__root__', 'b'], parentGroupId: 'a#1' }),
    ];
    const chain = resolveDrillChain(cyclic, 'a');
    expect(chain).not.toBeNull();
    expect(chain!.length).toBeLessThanOrEqual(2);
  });
});

describe('drillPathLabels', () => {
  it('maps runtimeGroupIds to display names', () => {
    expect(drillPathLabels(COMMITTEE, ['sf-Committee#1', 'legal#1']))
      .toEqual(['Committee', 'legal']);
  });
});
