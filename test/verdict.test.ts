import { describe, expect, it } from 'vitest';
import { computeVerdict, summarizeFindings } from '../src/verdict.js';
import type { Finding, Severity } from '../src/schemas.js';

function f(severity: Severity, kind: 'rule' | 'toolchain' | 'llm-review' = 'rule'): Finding {
  return {
    ruleId: 'sample',
    severity,
    category: 'custom',
    evidence: 'sample evidence',
    message: 'sample message',
    source:
      kind === 'rule'
        ? { kind: 'rule', ruleId: 'sample' }
        : kind === 'toolchain'
          ? { kind: 'toolchain', tool: 'lint' }
          : { kind: 'llm-review', ruleId: 'sample' },
  };
}

describe('computeVerdict', () => {
  it("returns 'pass' for no findings", () => {
    expect(computeVerdict([])).toBe('pass');
  });

  it("returns 'pass' when only HIGH/MED/LOW findings exist", () => {
    expect(computeVerdict([f('HIGH'), f('MED'), f('LOW')])).toBe('pass');
  });

  it("returns 'fail' on a single CRITICAL finding", () => {
    expect(computeVerdict([f('CRITICAL')])).toBe('fail');
  });

  it("returns 'fail' when CRITICAL is mixed with non-critical findings", () => {
    expect(computeVerdict([f('LOW'), f('CRITICAL'), f('HIGH')])).toBe('fail');
  });

  it("returns 'needs-review' when only LLM-review findings (non-critical) exist", () => {
    expect(computeVerdict([f('HIGH', 'llm-review')])).toBe('needs-review');
  });

  it("returns 'fail' even when an LLM-review finding is critical", () => {
    expect(computeVerdict([f('CRITICAL', 'llm-review')])).toBe('fail');
  });

  it("returns 'pass' when toolchain findings are non-critical", () => {
    expect(computeVerdict([f('HIGH', 'toolchain'), f('MED', 'toolchain')])).toBe('pass');
  });
});

describe('summarizeFindings', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeFindings([])).toEqual({
      critical: 0,
      high: 0,
      med: 0,
      low: 0,
      total: 0,
    });
  });

  it('counts each severity tier and the total', () => {
    const findings = [
      f('CRITICAL'),
      f('CRITICAL'),
      f('HIGH'),
      f('MED'),
      f('LOW'),
      f('LOW'),
      f('LOW'),
    ];
    expect(summarizeFindings(findings)).toEqual({
      critical: 2,
      high: 1,
      med: 1,
      low: 3,
      total: 7,
    });
  });
});
