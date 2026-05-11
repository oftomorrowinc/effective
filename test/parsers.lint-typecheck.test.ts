import { describe, expect, it } from 'vitest';
import { parseEslint } from '../src/toolchain/parsers/eslint.js';
import { parseTsc } from '../src/toolchain/parsers/tsc.js';
import { runResult } from './_run-result.js';

describe('parseEslint', () => {
  it('parses a single error from JSON output', () => {
    const stdout = JSON.stringify([
      {
        filePath: '/abs/app/api.ts',
        messages: [
          {
            ruleId: 'no-console',
            severity: 2,
            message: 'Unexpected console statement.',
            line: 12,
            column: 4,
            endLine: 12,
            endColumn: 18,
          },
        ],
        errorCount: 1,
        warningCount: 0,
      },
    ]);
    const { findings, count } = parseEslint(runResult({ stdout, exitCode: 1 }));
    expect(count).toBe(1);
    expect(findings[0]?.ruleId).toBe('eslint:no-console');
    expect(findings[0]?.severity).toBe('HIGH');
    expect(findings[0]?.location?.line).toBe(12);
    expect(findings[0]?.source).toMatchObject({
      kind: 'toolchain',
      tool: 'lint',
      nativeRuleId: 'no-console',
    });
  });

  it('maps severity 1 (warn) to MED and fatal to CRITICAL', () => {
    const stdout = JSON.stringify([
      {
        filePath: '/abs/x.ts',
        messages: [
          { ruleId: 'no-unused-vars', severity: 1, message: 'unused', line: 1, column: 1 },
          { ruleId: null, severity: 2, fatal: true, message: 'syntax error', line: 1, column: 1 },
        ],
      },
    ]);
    const { findings } = parseEslint(runResult({ stdout }));
    expect(findings[0]?.severity).toBe('MED');
    expect(findings[1]?.severity).toBe('CRITICAL');
    expect(findings[1]?.ruleId).toBe('eslint:eslint.parse-error');
  });

  it('returns an empty result for empty stdout', () => {
    expect(parseEslint(runResult())).toEqual({ findings: [], count: 0 });
  });

  it('returns an empty result for malformed JSON', () => {
    expect(parseEslint(runResult({ stdout: 'not json' }))).toEqual({ findings: [], count: 0 });
  });

  it('skips reports with no messages array', () => {
    const stdout = JSON.stringify([{ filePath: 'x.ts', messages: null }]);
    expect(parseEslint(runResult({ stdout }))).toEqual({ findings: [], count: 0 });
  });

  it('tolerates leading garbage before JSON (e.g., pnpm warnings)', () => {
    const stdout = `> some pnpm warning\n${JSON.stringify([
      {
        filePath: 'x.ts',
        messages: [{ ruleId: 'r', severity: 2, message: 'm', line: 1, column: 1 }],
      },
    ])}`;
    expect(parseEslint(runResult({ stdout })).count).toBe(1);
  });
});

describe('parseTsc', () => {
  it('parses a typical TS error line', () => {
    const stdout = `src/foo.ts(12,4): error TS2322: Type 'string' is not assignable to type 'number'.\n`;
    const { findings, count } = parseTsc(runResult({ stdout, exitCode: 1 }));
    expect(count).toBe(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'tsc:TS2322',
      severity: 'CRITICAL',
      location: { file: 'src/foo.ts', line: 12, column: 4 },
    });
  });

  it('parses warnings as MED', () => {
    const stdout = `src/foo.ts(1,1): warning TS6133: 'x' is declared but its value is never read.\n`;
    const { findings } = parseTsc(runResult({ stdout }));
    expect(findings[0]?.severity).toBe('MED');
  });

  it('parses errors written to stderr', () => {
    const stderr = `src/bar.ts(7,2): error TS1005: ';' expected.\n`;
    expect(parseTsc(runResult({ stderr })).count).toBe(1);
  });

  it('returns zero findings on clean output', () => {
    expect(parseTsc(runResult())).toEqual({ findings: [], count: 0 });
  });

  it('ignores non-matching lines', () => {
    const stdout = `Some unrelated banner\nFound 1 error.\n`;
    expect(parseTsc(runResult({ stdout })).count).toBe(0);
  });

  it('handles multiple errors in one run', () => {
    const stdout = [
      `src/a.ts(1,1): error TS1001: foo`,
      `src/b.ts(2,2): error TS1002: bar`,
      `src/c.ts(3,3): error TS1003: baz`,
    ].join('\n');
    expect(parseTsc(runResult({ stdout })).count).toBe(3);
  });
});
