import { describe, expect, it } from 'vitest';
import { parseVitest } from '../src/toolchain/parsers/vitest.js';
import { parseJest } from '../src/toolchain/parsers/jest.js';
import { parseNodeTest } from '../src/toolchain/parsers/node-test.js';
import { runResult } from './_run-result.js';

describe('parseVitest', () => {
  const sampleReport = JSON.stringify({
    numFailedTests: 1,
    numTotalTests: 5,
    testResults: [
      {
        name: '/abs/test/api.test.ts',
        status: 'failed',
        assertionResults: [
          { status: 'passed', fullName: 'returns 200' },
          {
            status: 'failed',
            fullName: 'enforces the rate limit',
            failureMessages: ['Expected 429 but got 200', 'at api.ts:42'],
          },
          { status: 'skipped', fullName: 'placeholder' },
        ],
      },
    ],
  });

  it('emits one finding per failed test with file location', () => {
    const { findings, count } = parseVitest(runResult({ stdout: sampleReport, exitCode: 1 }));
    expect(count).toBe(1);
    expect(findings[0]).toMatchObject({
      severity: 'CRITICAL',
      ruleId: 'vitest:test-failed',
      location: { file: '/abs/test/api.test.ts' },
    });
    expect(findings[0]?.message).toContain('enforces the rate limit');
    expect(findings[0]?.evidence).toContain('Expected 429');
  });

  it('returns no findings when nothing failed', () => {
    const stdout = JSON.stringify({
      numFailedTests: 0,
      numTotalTests: 3,
      testResults: [
        {
          name: 't.test.ts',
          status: 'passed',
          assertionResults: [{ status: 'passed', fullName: 'x' }],
        },
      ],
    });
    expect(parseVitest(runResult({ stdout, exitCode: 0 })).count).toBe(0);
  });

  it('omits count on malformed JSON — the run was not measured', () => {
    expect(parseVitest(runResult({ stdout: 'oops' }))).toEqual({ findings: [] });
  });

  it('tolerates non-JSON banner before the report', () => {
    const stdout = `pnpm announce\n${sampleReport}`;
    expect(parseVitest(runResult({ stdout })).count).toBe(1);
  });

  it('handles missing failure messages with a placeholder evidence', () => {
    const stdout = JSON.stringify({
      numFailedTests: 1,
      testResults: [{ name: 't.ts', assertionResults: [{ status: 'failed', fullName: 'broken' }] }],
    });
    expect(parseVitest(runResult({ stdout })).findings[0]?.evidence).toMatch(/no failure message/);
  });
});

describe('parseJest', () => {
  it('reuses the Vitest shape and rewrites the ruleId/message prefix', () => {
    const stdout = JSON.stringify({
      numFailedTests: 1,
      testResults: [
        {
          name: 't.ts',
          assertionResults: [{ status: 'failed', fullName: 'busted', failureMessages: ['Boom'] }],
        },
      ],
    });
    const { findings, count } = parseJest(runResult({ stdout, exitCode: 1 }));
    expect(count).toBe(1);
    expect(findings[0]?.ruleId).toBe('jest:test-failed');
    expect(findings[0]?.message.startsWith('Jest ')).toBe(true);
  });
});

describe('parseNodeTest', () => {
  it('parses a TAP failing test with a file diagnostic', () => {
    const stdout = [
      'TAP version 13',
      '# Subtest: t',
      'not ok 1 - returns 429 when limit exceeded',
      '  ---',
      "  file: 'test/rate.test.ts'",
      '  error: Expected 429 but got 200',
      '  ...',
    ].join('\n');
    const { findings, count } = parseNodeTest(runResult({ stdout, exitCode: 1 }));
    expect(count).toBe(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'node-test:test-failed',
      severity: 'CRITICAL',
      location: { file: 'test/rate.test.ts' },
    });
    expect(findings[0]?.evidence).toContain('Expected 429');
  });

  it('returns no findings on an all-passing run', () => {
    const stdout = `TAP version 13\nok 1 - works\n1..1\n`;
    expect(parseNodeTest(runResult({ stdout })).count).toBe(0);
  });

  it('captures a failure with no file diagnostic', () => {
    const stdout = `not ok 1 - syntax error in handler\n  message: something broke`;
    const { findings } = parseNodeTest(runResult({ stdout }));
    expect(findings[0]?.location).toBeUndefined();
    expect(findings[0]?.evidence).toMatch(/something broke/);
  });

  it('counts multiple failures', () => {
    const stdout = ['not ok 1 - a', 'not ok 2 - b', 'not ok 3 - c'].join('\n');
    expect(parseNodeTest(runResult({ stdout })).count).toBe(3);
  });
});
