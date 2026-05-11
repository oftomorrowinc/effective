import { describe, expect, it } from 'vitest';
import { renderResult } from '../src/cli/reporters.js';
import type { VerifyResult } from '../src/schemas.js';

const sampleResult: VerifyResult = {
  verdict: 'fail',
  findings: [
    {
      ruleId: 'no-todo',
      severity: 'CRITICAL',
      category: 'custom',
      location: { file: 'src/a.ts', line: 12, column: 4 },
      evidence: '// TODO: implement',
      message: 'Forbidden pattern matched.',
      source: { kind: 'rule', ruleId: 'no-todo' },
    },
    {
      ruleId: 'eslint:no-console',
      severity: 'HIGH',
      category: 'toolchain',
      location: { file: 'src/b.ts', line: 1 },
      evidence: 'Unexpected console statement.',
      message: 'ESLint: console.log used.',
      source: { kind: 'toolchain', tool: 'lint', nativeRuleId: 'no-console' },
    },
  ],
  summary: { critical: 1, high: 1, med: 0, low: 0, total: 2 },
};

describe('renderResult — pretty', () => {
  it('includes the verdict badge and severity counts', () => {
    const out = renderResult(sampleResult, 'pretty');
    expect(out).toContain('FAIL');
    expect(out).toContain('2 total');
    expect(out).toContain('1 CRITICAL');
    expect(out).toContain('1 HIGH');
  });

  it('renders one block per finding with location and evidence', () => {
    const out = renderResult(sampleResult, 'pretty');
    expect(out).toContain('src/a.ts:12:4');
    expect(out).toContain('no-todo');
    expect(out).toContain('// TODO: implement');
    expect(out).toContain('eslint:no-console');
  });

  it('marks project-wide findings clearly', () => {
    const out = renderResult(
      {
        ...sampleResult,
        findings: [{ ...sampleResult.findings[0], location: undefined } as never],
      },
      'pretty',
    );
    expect(out).toContain('(project-wide)');
  });

  it('says "No findings" when the result is empty', () => {
    const out = renderResult(
      {
        verdict: 'pass',
        findings: [],
        summary: { critical: 0, high: 0, med: 0, low: 0, total: 0 },
      },
      'pretty',
    );
    expect(out).toContain('PASS');
    expect(out).toContain('No findings');
  });
});

describe('renderResult — json', () => {
  it('returns valid JSON that round-trips', () => {
    const out = renderResult(sampleResult, 'json');
    expect(() => {
      JSON.parse(out);
    }).not.toThrow();
    const parsed = JSON.parse(out) as VerifyResult;
    expect(parsed.verdict).toBe('fail');
    expect(parsed.findings.length).toBe(2);
  });
});
