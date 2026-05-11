import { describe, expect, it } from 'vitest';
import { parseV8 } from '../src/toolchain/parsers/v8.js';
import { parseIstanbul } from '../src/toolchain/parsers/index.js';
import { runResult } from './_run-result.js';

describe('parseV8 (c8) / parseIstanbul', () => {
  it('emits no findings when every metric is at or above 90%', () => {
    const stdout = JSON.stringify({
      total: {
        lines: { pct: 91 },
        statements: { pct: 95 },
        functions: { pct: 100 },
        branches: { pct: 92.5 },
      },
    });
    expect(parseV8(runResult({ stdout })).count).toBe(0);
  });

  it('flags every metric below 90% with a separate finding', () => {
    const stdout = JSON.stringify({
      total: {
        lines: { pct: 80 },
        statements: { pct: 95 },
        functions: { pct: 70 },
        branches: { pct: 85 },
      },
    });
    const { findings, count } = parseV8(runResult({ stdout }));
    expect(count).toBe(3);
    const ruleIds = new Set(findings.map((f) => f.ruleId));
    expect(ruleIds).toContain('coverage:lines-below-threshold');
    expect(ruleIds).toContain('coverage:functions-below-threshold');
    expect(ruleIds).toContain('coverage:branches-below-threshold');
    expect(ruleIds).not.toContain('coverage:statements-below-threshold');
  });

  it('returns empty if the summary has no `total` row', () => {
    const stdout = JSON.stringify({ 'src/a.ts': { lines: { pct: 100 } } });
    expect(parseV8(runResult({ stdout })).count).toBe(0);
  });

  it('returns empty for malformed JSON', () => {
    expect(parseV8(runResult({ stdout: '{ broken' })).count).toBe(0);
  });

  it('handles missing metric percentages gracefully', () => {
    const stdout = JSON.stringify({
      total: {
        lines: {}, // no pct
        functions: { pct: 50 },
      },
    });
    expect(parseV8(runResult({ stdout })).count).toBe(1);
  });

  it('istanbul export is the same parser as v8', () => {
    const stdout = JSON.stringify({ total: { lines: { pct: 50 } } });
    expect(parseIstanbul(runResult({ stdout })).count).toBe(1);
  });

  it('tolerates a non-JSON banner before the summary', () => {
    const stdout = `Coverage Summary:\n${JSON.stringify({ total: { lines: { pct: 50 } } })}`;
    expect(parseV8(runResult({ stdout })).count).toBe(1);
  });
});
