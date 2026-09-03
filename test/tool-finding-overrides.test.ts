import { describe, expect, it } from 'vitest';
import { resolveConstitution } from '../src/resolve.js';
import { applyToolFindingOverrides } from '../src/rules/tool-overrides.js';
import type { Constitution, Finding } from '../src/schemas.js';

function coverageFinding(severity: Finding['severity'] = 'HIGH'): Finding {
  return {
    ruleId: 'coverage:lines-below-threshold',
    severity,
    category: 'toolchain',
    evidence: 'lines coverage 62.00% < 90%',
    message: 'Coverage below threshold.',
    source: { kind: 'toolchain', tool: 'coverage' },
  };
}

describe('severity overrides on parser-emitted findings', () => {
  it('accepts a `tool:name` override id instead of throwing "unknown rule"', () => {
    const config: Constitution = {
      rules: [],
      override: {
        'coverage:lines-below-threshold': {
          severity: 'LOW',
          rationale: 'Ratcheting up from 62%; promote back once we clear 90%.',
        },
      },
    };
    expect(() => resolveConstitution(config)).not.toThrow();
    const resolved = resolveConstitution(config);
    expect(resolved.toolFindingOverrides.get('coverage:lines-below-threshold')).toBe('LOW');
  });

  it('still throws on a bare unknown rule id — a typo is still a typo', () => {
    const config: Constitution = {
      rules: [],
      override: { 'no-such-rule': { severity: 'LOW', rationale: 'typo' } },
    };
    expect(() => resolveConstitution(config)).toThrow(/unknown rule/);
  });

  it('rewrites the severity the parser hardcoded', () => {
    const overrides = new Map([['coverage:lines-below-threshold', 'LOW' as const]]);
    const out = applyToolFindingOverrides([coverageFinding('HIGH')], overrides);
    expect(out[0]?.severity).toBe('LOW');
  });

  it('leaves findings the override does not name alone', () => {
    const overrides = new Map([['coverage:lines-below-threshold', 'LOW' as const]]);
    const other: Finding = { ...coverageFinding(), ruleId: 'eslint:no-eval' };
    const out = applyToolFindingOverrides([other], overrides);
    expect(out[0]?.severity).toBe('HIGH');
  });

  it('is a no-op when nothing is overridden', () => {
    const findings = [coverageFinding()];
    expect(applyToolFindingOverrides(findings, new Map())).toEqual(findings);
  });
});
