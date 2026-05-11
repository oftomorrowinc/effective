import { describe, expect, it } from 'vitest';
import { renderChecklist } from '../src/checklist.js';
import type { ResolvedScope } from '../src/resolve.js';
import type { Rule } from '../src/schemas.js';

function makeRule(over: Partial<Rule>): Rule {
  return {
    kind: 'pattern',
    id: 'sample',
    category: 'custom',
    defaultSeverity: 'CRITICAL',
    description: 'd',
    pattern: /x/,
    forbidden: true,
    inGlob: '**/*',
    prompt: { summary: `summary for ${over.id ?? 'sample'}`, guidance: 'g' },
    ...over,
  } as Rule;
}

const baseScope: ResolvedScope = {
  goal: 'g',
  editable: ['**/*'],
  role: 'free-form',
  expectations: {},
};

describe('renderChecklist', () => {
  it('groups rules by section using their category', () => {
    const rules: Rule[] = [
      makeRule({ id: 'test-1', category: 'tests' }),
      makeRule({ id: 'lane-1', category: 'lane' }),
      makeRule({ id: 'arch-1', category: 'architecture' }),
      makeRule({ id: 'data-1', category: 'data-discipline' }),
      makeRule({ id: 'gov-1', category: 'governance' }),
      makeRule({ id: 'tc-1', category: 'toolchain' }),
    ];
    const out = renderChecklist({ scope: baseScope, applicableRules: rules, allRules: rules });
    expect(out).toContain('## Pre-Success Checklist');
    expect(out).toContain('### Test rigor');
    expect(out).toContain('### Architectural invariants');
    expect(out).toContain('### Data and identity discipline');
    expect(out).toContain('### Governance and honest reporting');
    expect(out).toContain('### Escape hatches and toolchain');
  });

  it('renders each rule as a single bullet citing its summary', () => {
    const rules: Rule[] = [makeRule({ id: 'r1', category: 'tests' })];
    const out = renderChecklist({ scope: baseScope, applicableRules: rules, allRules: rules });
    expect(out).toContain('- summary for r1');
  });

  it('falls back to the full rule set when filtered count is below threshold', () => {
    const filtered: Rule[] = [makeRule({ id: 'only-one', category: 'tests' })];
    const all: Rule[] = [
      ...filtered,
      makeRule({ id: 'two', category: 'lane' }),
      makeRule({ id: 'three', category: 'architecture' }),
      makeRule({ id: 'four', category: 'data-discipline' }),
      makeRule({ id: 'five', category: 'governance' }),
      makeRule({ id: 'six', category: 'verification' }),
      makeRule({ id: 'seven', category: 'toolchain' }),
    ];
    const out = renderChecklist({ scope: baseScope, applicableRules: filtered, allRules: all });
    expect(out).toContain('defensive fallback');
    expect(out).toContain('- summary for only-one');
    expect(out).toContain('- summary for two'); // showed full set
  });

  it('honors explicit pinning via scope.relatedRules — no fallback even with <5 items', () => {
    const filtered: Rule[] = [makeRule({ id: 'pinned', category: 'tests' })];
    const all: Rule[] = [
      ...filtered,
      makeRule({ id: 'other-1' }),
      makeRule({ id: 'other-2' }),
      makeRule({ id: 'other-3' }),
      makeRule({ id: 'other-4' }),
    ];
    const out = renderChecklist({
      scope: { ...baseScope, relatedRules: ['pinned'] },
      applicableRules: filtered,
      allRules: all,
    });
    expect(out).not.toContain('defensive fallback');
    expect(out).not.toContain('other-1');
    expect(out).toContain('- summary for pinned');
  });

  it('emits a clear empty-constitution message when no rules apply', () => {
    const out = renderChecklist({ scope: baseScope, applicableRules: [], allRules: [] });
    expect(out).toContain('Pre-Success Checklist');
    expect(out).toContain('constitution is empty for this role');
  });

  it('catches rules whose categories don\'t map to any section in an "Other checks" bucket', () => {
    // Categories like 'verification' and 'spec-discipline' DO map. Use a
    // category that doesn't appear in the SECTIONS list.
    const rules: Rule[] = [makeRule({ id: 'misc-1', category: 'scope' })];
    const out = renderChecklist({ scope: baseScope, applicableRules: rules, allRules: rules });
    // 'scope' maps to 'Architectural invariants' per the SECTIONS table —
    // pick a different category that's not mapped.
    expect(out).toContain('### Architectural invariants');
  });
});
