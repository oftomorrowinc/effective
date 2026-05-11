import { describe, expect, it } from 'vitest';
import { kickBack } from '../src/kickBack.js';
import type { Finding } from '../src/schemas.js';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'sample',
    severity: 'CRITICAL',
    category: 'custom',
    evidence: 'console.log(x)',
    message: 'Forbidden pattern matched.',
    source: { kind: 'rule', ruleId: 'sample' },
    ...over,
  };
}

describe('kickBack', () => {
  it('cites each failing rule by id with finding count', () => {
    const out = kickBack({
      findings: [
        finding({ ruleId: 'no-console', message: 'no console' }),
        finding({ ruleId: 'no-console', location: { file: 'app/api.ts', line: 12 } }),
        finding({ ruleId: 'lane.editable-respected', category: 'lane' }),
      ],
      previousPrompt: 'do the thing',
    });
    expect(out).toContain('no-console');
    expect(out).toContain('2 finding(s)');
    expect(out).toContain('lane.editable-respected');
    expect(out).toContain('app/api.ts:12');
  });

  it('rules out shortcuts (no "consider adjusting threshold")', () => {
    const out = kickBack({
      findings: [finding()],
      previousPrompt: 'task',
    });
    expect(out).toMatch(/not by lowering thresholds, disabling rules/);
    expect(out).not.toMatch(/consider adjusting the threshold/i);
  });

  it('includes the previous prompt as still-active context', () => {
    const out = kickBack({
      findings: [finding()],
      previousPrompt: 'Add a rate limiter to /api/signals',
    });
    expect(out).toMatch(/Original task \(still active\)/);
    expect(out).toContain('Add a rate limiter to /api/signals');
  });

  it('sorts groups by worst severity then rule id', () => {
    const out = kickBack({
      findings: [
        finding({ ruleId: 'zzz-rule', severity: 'CRITICAL' }),
        finding({ ruleId: 'aaa-rule', severity: 'CRITICAL' }),
      ],
      previousPrompt: 'task',
    });
    const aaaIdx = out.indexOf('aaa-rule');
    const zzzIdx = out.indexOf('zzz-rule');
    expect(aaaIdx).toBeGreaterThan(0);
    expect(zzzIdx).toBeGreaterThan(aaaIdx);
  });

  it('handles a no-critical-findings case (non-critical signal only)', () => {
    const out = kickBack({
      findings: [finding({ severity: 'HIGH', ruleId: 'high-only' })],
      previousPrompt: 'task',
    });
    expect(out).toMatch(/No CRITICAL findings/);
    expect(out).toContain('high-only');
  });

  it('escapes backticks in evidence to keep markdown sane', () => {
    const out = kickBack({
      findings: [finding({ evidence: 'value: `weird`' })],
      previousPrompt: 'task',
    });
    expect(out).toContain('value: \\`weird\\`');
  });
});
